package com.elrayo.autodesign

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream

class MainActivity : ComponentActivity() {

  companion object {
    private const val LIVE_BASE_URL = "https://jese12cr-beep.github.io/el-rayo-autodesign/"
    private const val OFFLINE_URL = "https://appassets.androidplatform.net/app/index.html"
  }

  private var webViewRef: WebView? = null
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  private var cameraPhotoUri: Uri? = null
  private var pendingCameraAcceptedTypes: Array<String> = emptyArray()
  private var usingOfflineFallback = false

  private val fileChooserLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
      val cb = fileChooserCallback
      fileChooserCallback = null
      if (cb == null) return@registerForActivityResult

      var results: Array<Uri>? = null
      if (result.resultCode == Activity.RESULT_OK) {
        val data = result.data
        val clip = data?.clipData
        val dataUri = data?.data
        results =
          when {
            clip != null && clip.itemCount > 0 ->
              Array(clip.itemCount) { idx -> clip.getItemAt(idx).uri }
            dataUri != null -> arrayOf(dataUri)
            cameraPhotoUri != null -> arrayOf(cameraPhotoUri!!)
            else -> null
          }
      }
      cb.onReceiveValue(results)
    }

  private val cameraPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) {
      launchImagePickerChooser(includeCamera = it)
    }

  private fun isOnline(): Boolean {
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
    val net = cm.activeNetwork ?: return false
    val caps = cm.getNetworkCapabilities(net) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
      caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
  }

  private fun fallbackToOffline(view: WebView) {
    if (usingOfflineFallback) return
    usingOfflineFallback = true
    runOnUiThread {
      Toast.makeText(this, "Sin conexión: abriendo versión offline integrada", Toast.LENGTH_SHORT).show()
      view.loadUrl(OFFLINE_URL)
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.light(0xFFEEF1F5.toInt(), 0xFFEEF1F5.toInt()),
      navigationBarStyle = SystemBarStyle.light(0xFFFFFFFF.toInt(), 0xFFFFFFFF.toInt())
    )

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          val wv = webViewRef
          if (wv != null && wv.canGoBack()) {
            wv.goBack()
          } else {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
          }
        }
      }
    )

    val assetLoader =
      WebViewAssetLoader.Builder()
        .addPathHandler("/app/", WebViewAssetLoader.AssetsPathHandler(this))
        .build()

    setContent {
      Box(
        modifier =
          Modifier.fillMaxSize()
            .background(Color(0xFFEEF1F5))
            .systemBarsPadding()
      ) {
        AndroidView(
          modifier = Modifier.fillMaxSize(),
          factory = { ctx ->
            WebView.setWebContentsDebuggingEnabled(true)
            WebView(ctx).apply {
              layoutParams =
                ViewGroup.LayoutParams(
                  ViewGroup.LayoutParams.MATCH_PARENT,
                  ViewGroup.LayoutParams.MATCH_PARENT
                )
              settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = true
                useWideViewPort = true
                loadWithOverviewMode = true
                builtInZoomControls = false
                displayZoomControls = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                cacheMode = WebSettings.LOAD_DEFAULT
              }
              addJavascriptInterface(ElRayoJsBridge(ctx, this), "ElRayoAndroid")

              webViewClient =
                object : WebViewClient() {
                  override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                  ): WebResourceResponse? {
                    val url = request.url
                    if (url.host != "appassets.androidplatform.net") return null
                    val response = assetLoader.shouldInterceptRequest(url) ?: return null
                    val path = url.path?.lowercase() ?: ""
                    when {
                      path.endsWith(".mjs") || path.endsWith(".js") ->
                        response.mimeType = "application/javascript"
                      path.endsWith(".wasm") -> response.mimeType = "application/wasm"
                      path.endsWith(".onnx") -> response.mimeType = "application/octet-stream"
                      path.endsWith(".svg") -> response.mimeType = "image/svg+xml"
                      path.endsWith(".png") -> response.mimeType = "image/png"
                      path.endsWith(".html") -> response.mimeType = "text/html"
                    }
                    return response
                  }

                  override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                  ) {
                    if (request.isForMainFrame && !usingOfflineFallback) {
                      fallbackToOffline(view)
                    }
                  }

                  override fun onReceivedHttpError(
                    view: WebView,
                    request: WebResourceRequest,
                    errorResponse: WebResourceResponse
                  ) {
                    if (request.isForMainFrame && errorResponse.statusCode >= 500 && !usingOfflineFallback) {
                      fallbackToOffline(view)
                    }
                  }
                }

              webChromeClient =
                object : WebChromeClient() {
                  override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                    Log.d(
                      "ElRayoWeb",
                      "[${consoleMessage.messageLevel()}] ${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})"
                    )
                    return super.onConsoleMessage(consoleMessage)
                  }

                  override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: FileChooserParams?
                  ): Boolean {
                    this@MainActivity.fileChooserCallback?.onReceiveValue(null)
                    this@MainActivity.fileChooserCallback = filePathCallback
                    pendingCameraAcceptedTypes = fileChooserParams?.acceptTypes ?: arrayOf("image/*")

                    val hasCamPerm =
                      ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
                        PackageManager.PERMISSION_GRANTED
                    if (hasCamPerm) {
                      launchImagePickerChooser(includeCamera = true)
                    } else {
                      cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                    return true
                  }
                }

              webViewRef = this
              if (isOnline()) {
                usingOfflineFallback = false
                loadUrl("${LIVE_BASE_URL}?app=android&v=${System.currentTimeMillis()}")
              } else {
                usingOfflineFallback = true
                loadUrl(OFFLINE_URL)
              }
            }
          }
        )
      }
    }
  }

  private fun launchImagePickerChooser(includeCamera: Boolean) {
    val contentIntent =
      Intent(Intent.ACTION_GET_CONTENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "image/*"
        if (pendingCameraAcceptedTypes.isNotEmpty() && pendingCameraAcceptedTypes.none { it.isBlank() }) {
          putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/jpeg", "image/png", "image/webp", "image/svg+xml"))
        }
      }

    var cameraIntent: Intent? = null
    cameraPhotoUri = null
    if (includeCamera && packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
      val camDir = File(cacheDir, "camera").apply { mkdirs() }
      val photoFile = File(camDir, "el_rayo_cam_${System.currentTimeMillis()}.jpg")
      val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", photoFile)
      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
        putExtra(MediaStore.EXTRA_OUTPUT, uri)
        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      if (intent.resolveActivity(packageManager) != null) {
        cameraPhotoUri = uri
        cameraIntent = intent
      }
    }

    val chooser = Intent.createChooser(contentIntent, "Subir foto o tomar fotografía del vehículo")
    if (cameraIntent != null) {
      chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
    }

    try {
      fileChooserLauncher.launch(chooser)
    } catch (_: Exception) {
      fileChooserCallback?.onReceiveValue(null)
      fileChooserCallback = null
    }
  }

  override fun onDestroy() {
    webViewRef?.destroy()
    webViewRef = null
    super.onDestroy()
  }

  inner class ElRayoJsBridge(
    private val context: Context,
    private val webView: WebView
  ) {
    @JavascriptInterface
    fun savePng(dataUrl: String, filename: String) {
      try {
        val base64Part = dataUrl.substringAfter("base64,", "")
        if (base64Part.isBlank()) return
        val bytes = Base64.decode(base64Part, Base64.DEFAULT)
        val safeName =
          filename.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "el_rayo_render.png" }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val values =
            ContentValues().apply {
              put(MediaStore.Images.Media.DISPLAY_NAME, safeName)
              put(MediaStore.Images.Media.MIME_TYPE, "image/png")
              put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/ElRayo")
              put(MediaStore.Images.Media.IS_PENDING, 1)
            }
          val resolver = context.contentResolver
          val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return
          resolver.openOutputStream(uri)?.use { it.write(bytes) }
          values.clear()
          values.put(MediaStore.Images.Media.IS_PENDING, 0)
          resolver.update(uri, values, null, null)
        } else {
          val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "ElRayo")
          dir.mkdirs()
          FileOutputStream(File(dir, safeName)).use { it.write(bytes) }
        }

        runOnUiThread {
          Toast.makeText(context, "Guardado en Galería: Pictures/ElRayo/$safeName", Toast.LENGTH_LONG).show()
        }
      } catch (e: Exception) {
        runOnUiThread {
          Toast.makeText(context, "Error al guardar PNG: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }
    }

    @JavascriptInterface
    fun printPage(jobTitle: String) {
      val safeJob = jobTitle.ifBlank { "ElRayo_AutoDesign" }
      runOnUiThread {
        val pm = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return@runOnUiThread
        val adapter = webView.createPrintDocumentAdapter(safeJob)
        val attrs =
          PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.NA_LETTER)
            .build()
        pm.print(safeJob, adapter, attrs)
      }
    }
  }
}
