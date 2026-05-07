package com.example.syncscreen

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import java.io.File

class SlideshowActivity : Activity() {

    companion object {
        private const val TAG = "Slideshow"
        private const val HEARTBEAT_MS = 15_000L
    }

    private lateinit var imageView: ImageView
    private lateinit var cfg: ConfigManager
    private lateinit var api: ApiService

    private var imageFiles = listOf<File>()
    private var index = 0
    private val uiHandler = Handler(Looper.getMainLooper())
    private var slideRunnable: Runnable? = null

    @Volatile private var running = true

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

        imageView = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        setContentView(imageView)

        loadCachedImages()
        startSlideshow()
        startBackgroundSync()
    }

    // ─── Imagens ─────────────────────────────────────────────────────────────

    private fun loadCachedImages() {
        val dir = cfg.imagesDir
        imageFiles = cfg.remoteImageNames
            .map { File(dir, it) }
            .filter { it.exists() }
        index = 0
        Log.d(TAG, "Imagens em cache: ${imageFiles.size}")
    }

    private fun showNextImage() {
        if (imageFiles.isEmpty()) {
            imageView.setImageResource(R.drawable.default_background)
            return
        }
        val file = imageFiles[index % imageFiles.size]
        index++

        imageView.animate().alpha(0f).setDuration(400).withEndAction {
            val bmp = BitmapFactory.decodeFile(file.absolutePath)
            if (bmp != null) {
                imageView.setImageBitmap(bmp)
            } else {
                imageView.setImageResource(R.drawable.default_background)
            }
            imageView.animate().alpha(1f).setDuration(600).start()
        }.start()
    }

    private fun startSlideshow() {
        slideRunnable?.let { uiHandler.removeCallbacks(it) }
        val intervalMs = cfg.slideInterval.coerceAtLeast(1) * 1000L
        val r = object : Runnable {
            override fun run() {
                showNextImage()
                uiHandler.postDelayed(this, intervalMs)
            }
        }
        slideRunnable = r
        uiHandler.post(r)
    }

    // ─── Sync em background ───────────────────────────────────────────────────

    private fun startBackgroundSync() {
        Thread {
            doSync()
            while (running) {
                try {
                    Thread.sleep(HEARTBEAT_MS)
                } catch (_: InterruptedException) {
                    break   // thread interrompida — encerra normalmente
                }
                if (!running) break
                try {
                    doSync()
                } catch (e: Exception) {
                    Log.e(TAG, "Erro no sync: ${e.message}")
                }
            }
        }.apply { isDaemon = true; name = "SlideshowSync" }.start()
    }

    private fun doSync() {
        val config = api.heartbeat(cfg.tvId) ?: return

        val modeChanged   = config.mode != cfg.mode
        val imagesChanged = config.images.map { it.filename } != cfg.remoteImageNames
        val intervalChanged = config.slideInterval != cfg.slideInterval

        cfg.applyConfig(config)

        if (modeChanged) {
            runOnUiThread { finish() }   // MainActivity.onResume() redirecionará para o novo modo
            return
        }

        if (imagesChanged) {
            downloadMissingImages(config.images)
            cleanObsoleteImages(config.images)
        }

        if (imagesChanged || intervalChanged) {
            runOnUiThread {
                loadCachedImages()
                startSlideshow()
            }
        }
    }

    private fun downloadMissingImages(remoteImages: List<ApiService.RemoteImage>) {
        val dir = cfg.imagesDir
        remoteImages.forEach { img ->
            if (!running) return
            val file = File(dir, img.filename)
            if (!file.exists()) {
                Log.d(TAG, "Baixando: ${img.filename}")
                api.downloadImage(img.filename, file)
            }
        }
    }

    private fun cleanObsoleteImages(remoteImages: List<ApiService.RemoteImage>) {
        val keep = remoteImages.map { it.filename }.toSet()
        cfg.imagesDir.listFiles()?.forEach { file ->
            if (file.name !in keep) {
                Log.d(TAG, "Removendo cache obsoleto: ${file.name}")
                file.delete()
            }
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

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
        slideRunnable?.let { uiHandler.removeCallbacks(it) }
        super.onDestroy()
    }
}
