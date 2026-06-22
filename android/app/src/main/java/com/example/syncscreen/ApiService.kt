package com.example.syncscreen

import android.content.Context
import android.net.ConnectivityManager
import android.util.Log
import com.example.syncscreen.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL

class ApiService(private val context: Context) {

    data class Config(
        val mode: String,
        val webviewUrl: String,
        val slideInterval: Int,
        val images: List<RemoteImage>,
    )

    data class RemoteImage(
        val id: Int,
        val filename: String,
    )

    companion object {
        private const val TAG = "ApiService"
        val BASE_URL: String get() = BuildConfig.SERVER_URL
    }

    // Compatível com API 21+ (activeNetworkInfo foi removido na API 29,
    // mas continua funcional até lá; para minSDK 21 é a única opção sem flag)
    fun isNetworkAvailable(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        @Suppress("DEPRECATION")
        val info = cm.activeNetworkInfo
        return info != null && info.isConnected
    }

    // Registra a TV e obtém configuração atual
    fun register(tvId: String, tvName: String): Config? {
        if (!isNetworkAvailable()) return null
        return try {
            val payload = JSONObject().apply {
                put("id", tvId)
                put("name", tvName)
                put("ip_address", localIp())
                put("android_id", tvId)
            }
            val json = JSONObject(post("/api/tvs/register", payload.toString()))
            parseConfig(json.getJSONObject("config"))
        } catch (e: Exception) {
            Log.w(TAG, "register failed: ${e.message}")
            null
        }
    }

    // Heartbeat: informa que a TV está online e obtém config atualizada
    fun heartbeat(tvId: String): Config? {
        if (!isNetworkAvailable()) return null
        return try {
            val payload = JSONObject().apply { put("id", tvId) }
            val json = JSONObject(post("/api/tvs/heartbeat", payload.toString()))
            parseConfig(json.getJSONObject("config"))
        } catch (e: Exception) {
            Log.w(TAG, "heartbeat failed: ${e.message}")
            null
        }
    }

    // Baixa uma imagem e salva em destino local
    fun downloadImage(filename: String, dest: File): Boolean {
        return try {
            val conn = URL("$BASE_URL/uploads/$filename").openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout    = 30_000
            conn.connect()
            if (conn.responseCode != 200) return false
            conn.inputStream.use { input ->
                FileOutputStream(dest).use { out -> input.copyTo(out) }
            }
            true
        } catch (e: Exception) {
            Log.w(TAG, "download failed [$filename]: ${e.message}")
            dest.delete()
            false
        }
    }

    private fun parseConfig(json: JSONObject): Config {
        val arr = json.optJSONArray("images") ?: JSONArray()
        val images = (0 until arr.length()).map { i ->
            val img = arr.getJSONObject(i)
            RemoteImage(img.getInt("id"), img.getString("filename"))
        }
        return Config(
            mode          = json.optString("mode", "slideshow"),
            webviewUrl    = json.optString("webview_url", ""),
            slideInterval = json.optInt("slide_interval", 5),
            images        = images,
        )
    }

    private fun post(path: String, body: String): String {
        val conn = URL("$BASE_URL$path").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput       = true
        conn.connectTimeout = 10_000
        conn.readTimeout    = 10_000
        conn.outputStream.use { it.write(body.toByteArray()) }
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        return stream?.bufferedReader()?.readText() ?: ""
    }

    private fun localIp(): String = try {
        NetworkInterface.getNetworkInterfaces()?.toList()
            ?.flatMap { it.inetAddresses.toList() }
            ?.firstOrNull { !it.isLoopbackAddress && it is Inet4Address }
            ?.hostAddress ?: ""
    } catch (_: Exception) { "" }
}
