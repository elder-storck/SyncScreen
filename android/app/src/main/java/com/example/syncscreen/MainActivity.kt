package com.example.syncscreen

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.WindowManager

/**
 * Ponto de entrada do app — coordenador invisível.
 *
 * Fluxo:
 * 1. Gera/persiste o ID único da TV
 * 2. Registra no backend em background
 * 3. Ao receber config, roteia para SlideshowActivity ou WebViewActivity
 * 4. Quando a activity filho chama finish() (mudança de modo), onResume()
 *    reavalia e re-roteia para o novo modo
 */
class MainActivity : Activity() {

    companion object {
        private const val TAG = "MainActivity"
    }

    private lateinit var cfg: ConfigManager
    private lateinit var api: ApiService

    // Último modo que já foi despachado — evita recriar activity sem necessidade
    @Volatile private var lastMode = ""

    // Garante que o registro inicial só dispara uma vez por ciclo de vida
    private var registrationStarted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        cfg = ConfigManager(this)
        api = ApiService(this)

        if (cfg.tvId.isBlank()) {
            cfg.tvId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                ?: java.util.UUID.randomUUID().toString()
        }

        Log.d(TAG, "TV ID: ${cfg.tvId}")
        Log.d(TAG, "SERVER_URL: ${BuildConfig.SERVER_URL}")

        startRegistration()
    }

    override fun onResume() {
        super.onResume()
        // Só re-roteia ao voltar de uma activity filho (depois que o registro já ocorreu)
        if (registrationStarted) routeToMode()
    }

    private fun startRegistration() {
        registrationStarted = true
        Thread {
            Log.d(TAG, "Registrando com o backend...")
            val config = api.register(cfg.tvId, android.os.Build.MODEL)
            if (config != null) {
                Log.d(TAG, "Registro OK — modo: ${config.mode}")
                cfg.applyConfig(config)
            } else {
                Log.w(TAG, "Registro falhou — usando config em cache (modo: ${cfg.mode})")
            }
            runOnUiThread { routeToMode() }
        }.start()
    }

    private fun routeToMode() {
        val mode = cfg.mode
        if (mode == lastMode) return
        lastMode = mode

        Log.d(TAG, "Roteando para modo: $mode")

        // FLAG_ACTIVITY_CLEAR_TOP evita empilhar SlideshowActivity + WebViewActivity
        val intent = when (mode) {
            "webview" -> Intent(this, WebViewActivity::class.java)
            else      -> Intent(this, SlideshowActivity::class.java)
        }.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)

        startActivity(intent)
    }
}
