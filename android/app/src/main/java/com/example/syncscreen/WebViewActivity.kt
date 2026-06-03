package com.example.syncscreen

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class WebViewActivity : Activity() {

    companion object {
        private const val HEARTBEAT_MS = 15_000L
    }

    private lateinit var webView: WebView
    private lateinit var cfg: ConfigManager
    private lateinit var api: ApiService

    @Volatile private var running = true

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

        cfg = ConfigManager(this)
        api = ApiService(this)

        webView = WebView(this).also {
            it.webViewClient = WebViewClient()
            it.settings.apply {
                javaScriptEnabled      = true
                domStorageEnabled      = true
                useWideViewPort        = true
                loadWithOverviewMode   = true
                setSupportZoom(false)
                builtInZoomControls    = false
                displayZoomControls    = false
                // Desabilita gestos e scroll para modo kiosk
                @Suppress("DEPRECATION")
                setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL)
            }
        }
        setContentView(webView)

        loadUrl()
        startBackgroundSync()
    }

    private fun loadUrl() {
        val url = cfg.webviewUrl.ifBlank { "about:blank" }
        webView.loadUrl(url)
    }

    private fun startBackgroundSync() {
        Thread {
            while (running) {
                try {
                    Thread.sleep(HEARTBEAT_MS)
                } catch (_: InterruptedException) {
                    break   // thread interrompida — encerra normalmente
                }
                if (!running) break
                try {
                    val config = api.heartbeat(cfg.tvId) ?: continue
                    val modeChanged = config.mode != cfg.mode
                    val urlChanged  = config.webviewUrl != cfg.webviewUrl
                    cfg.applyConfig(config)
                    runOnUiThread {
                        when {
                            modeChanged -> finish()
                            urlChanged  -> loadUrl()
                        }
                    }
                    if (modeChanged) break
                } catch (e: Exception) {
                    android.util.Log.e("WebViewActivity", "Erro no sync: ${e.message}")
                }
            }
        }.apply { isDaemon = true; name = "WebViewSync" }.start()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    override fun onDestroy() {
        running = false
        webView.destroy()
        super.onDestroy()
    }
}
