package com.example.syncscreen

import android.app.Activity
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.ImageView
import java.io.File

class SlideshowActivity : Activity() {

    companion object {
        private const val TAG = "Slideshow"
        private const val HEARTBEAT_MS = 15_000L
        private const val OVERLAY_HIDE_MS = 3_000L
    }

    private lateinit var cfg: ConfigManager
    private lateinit var api: ApiService

    private lateinit var slideImage: ImageView
    private lateinit var overlayContainer: View
    private lateinit var overlayBg: View
    private lateinit var btnPrev: ImageButton
    private lateinit var btnPause: ImageButton
    private lateinit var btnNext: ImageButton
    private lateinit var pauseIcon: ImageView

    private var imageFiles = listOf<File>()
    private var currentIndex = 0
    private val uiHandler = Handler(Looper.getMainLooper())
    private var slideRunnable: Runnable? = null
    private var overlayHideRunnable: Runnable? = null
    private var isPaused = false

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

        setContentView(R.layout.activity_slideshow)

        slideImage       = findViewById(R.id.slide_image)
        overlayContainer = findViewById(R.id.overlay_container)
        overlayBg        = findViewById(R.id.overlay_bg)
        btnPrev          = findViewById(R.id.btn_prev)
        btnPause         = findViewById(R.id.btn_pause)
        btnNext          = findViewById(R.id.btn_next)
        pauseIcon        = findViewById(R.id.pause_icon)

        val root = findViewById<View>(R.id.root)
        root.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_DOWN) showOverlay()
            false
        }
        overlayBg.setOnClickListener { resetOverlayTimer() }
        btnPause.setOnClickListener {
            if (isPaused) resumeSlideshow() else pauseSlideshow()
            updatePauseIcon()
            resetOverlayTimer()
        }
        btnPrev.setOnClickListener { showPrev(); resetOverlayTimer() }
        btnNext.setOnClickListener { showNext(); resetOverlayTimer() }

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
        currentIndex = 0
        Log.d(TAG, "Imagens em cache: ${imageFiles.size}")
    }

    private fun showImageAt(i: Int) {
        if (imageFiles.isEmpty()) {
            slideImage.setImageResource(R.drawable.default_background)
            return
        }
        currentIndex = i
        val file = imageFiles[i] // captura antes da animação para evitar corrida com toque rápido
        slideImage.animate().alpha(0f).setDuration(400).withEndAction {
            val bmp = BitmapFactory.decodeFile(file.absolutePath)
            if (bmp != null) slideImage.setImageBitmap(bmp)
            else slideImage.setImageResource(R.drawable.default_background)
            slideImage.animate().alpha(1f).setDuration(600).start()
        }.start()
    }

    private fun showNext() {
        if (imageFiles.isEmpty()) return
        showImageAt((currentIndex + 1) % imageFiles.size)
    }

    private fun showPrev() {
        if (imageFiles.isEmpty()) return
        showImageAt((currentIndex - 1 + imageFiles.size) % imageFiles.size)
    }

    private fun startSlideshow() {
        slideRunnable?.let { uiHandler.removeCallbacks(it) }
        val intervalMs = cfg.slideInterval.coerceAtLeast(1) * 1000L
        val r = object : Runnable {
            override fun run() {
                showNext()
                uiHandler.postDelayed(this, intervalMs)
            }
        }
        slideRunnable = r
        showImageAt(currentIndex)            // exibe imagem atual imediatamente
        uiHandler.postDelayed(r, intervalMs) // avança após intervalo
    }

    // ─── Sync em background ───────────────────────────────────────────────────

    private fun startBackgroundSync() {
        Thread {
            doSync()
            while (running) {
                try {
                    Thread.sleep(HEARTBEAT_MS)
                } catch (_: InterruptedException) {
                    break
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

        val modeChanged     = config.mode != cfg.mode
        val imagesChanged   = config.images.map { it.filename } != cfg.remoteImageNames
        val intervalChanged = config.slideInterval != cfg.slideInterval

        cfg.applyConfig(config)

        if (modeChanged) {
            runOnUiThread { finish() }
            return
        }

        if (imagesChanged) {
            downloadMissingImages(config.images)
            cleanObsoleteImages(config.images)
        }

        if (imagesChanged || intervalChanged) {
            runOnUiThread {
                loadCachedImages()
                if (!isPaused) startSlideshow()
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

    // ─── Overlay ─────────────────────────────────────────────────────────────

    private fun showOverlay() {
        overlayHideRunnable?.let { uiHandler.removeCallbacks(it) }
        overlayContainer.visibility = View.VISIBLE
        updatePauseIcon()
        scheduleOverlayHide()
    }

    private fun resetOverlayTimer() {
        overlayHideRunnable?.let { uiHandler.removeCallbacks(it) }
        scheduleOverlayHide()
    }

    private fun pauseSlideshow() {
        isPaused = true
        slideRunnable?.let { uiHandler.removeCallbacks(it) }
        slideRunnable = null
        btnPause.setImageResource(R.drawable.ic_play)
    }

    private fun resumeSlideshow() {
        isPaused = false
        btnPause.setImageResource(R.drawable.ic_pause)
        val intervalMs = cfg.slideInterval.coerceAtLeast(1) * 1000L
        val r = object : Runnable {
            override fun run() {
                showNext()
                uiHandler.postDelayed(this, intervalMs)
            }
        }
        slideRunnable = r
        uiHandler.postDelayed(r, intervalMs)
    }

    private fun updatePauseIcon() {
        pauseIcon.visibility = if (isPaused && overlayContainer.visibility == View.GONE)
            View.VISIBLE else View.GONE
    }

    private fun scheduleOverlayHide() {
        val r = Runnable {
            overlayContainer.visibility = View.GONE
            updatePauseIcon()
        }
        overlayHideRunnable = r
        uiHandler.postDelayed(r, OVERLAY_HIDE_MS)
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        showOverlay()
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT  -> { showPrev(); true }
            KeyEvent.KEYCODE_DPAD_RIGHT -> { showNext(); true }
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                if (isPaused) resumeSlideshow() else pauseSlideshow()
                updatePauseIcon()
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
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
        slideRunnable?.let { uiHandler.removeCallbacks(it) }
        overlayHideRunnable?.let { uiHandler.removeCallbacks(it) }
        super.onDestroy()
    }
}
