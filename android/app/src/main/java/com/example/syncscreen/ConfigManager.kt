package com.example.syncscreen

import android.content.Context
import java.io.File

class ConfigManager(private val context: Context) {

    private val prefs = context.getSharedPreferences("syncscreen", Context.MODE_PRIVATE)

    var mode: String
        get() = prefs.getString("mode", "slideshow")!!
        set(v) { prefs.edit().putString("mode", v).apply() }

    var webviewUrl: String
        get() = prefs.getString("webview_url", "")!!
        set(v) { prefs.edit().putString("webview_url", v).apply() }

    var slideInterval: Int
        get() = prefs.getInt("slide_interval", 5)
        set(v) { prefs.edit().putInt("slide_interval", v).apply() }

    var tvId: String
        get() = prefs.getString("tv_id", "")!!
        set(v) { prefs.edit().putString("tv_id", v).apply() }

    // Lista de filenames das imagens remotas (ordem do servidor)
    var remoteImageNames: List<String>
        get() {
            val s = prefs.getString("remote_images", "") ?: ""
            return if (s.isBlank()) emptyList() else s.split(",")
        }
        private set(v) { prefs.edit().putString("remote_images", v.joinToString(",")).apply() }

    // Diretório local de cache de imagens
    val imagesDir: File
        get() = File(context.filesDir, "images").also { if (!it.exists()) it.mkdirs() }

    // Aplica configuração recebida do servidor e persiste localmente
    fun applyConfig(config: ApiService.Config) {
        prefs.edit()
            .putString("mode", config.mode)
            .putString("webview_url", config.webviewUrl)
            .putInt("slide_interval", config.slideInterval)
            .putString("remote_images", config.images.map { it.filename }.joinToString(","))
            .apply()
    }
}
