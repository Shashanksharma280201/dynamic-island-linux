package expo.modules.shareintake

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Share -> Island Drop from any app: the files (or text) another app shares,
 * copied into the app's cache so they can be sent like any other file.
 * take() hands them over once; "onShare" says a share came in while the app
 * was already open.
 */
class ShareIntakeModule : Module() {
  private var pending: Intent? = null

  private val context: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("ShareIntake")
    Events("onShare")

    OnNewIntent { intent ->
      if (isShare(intent)) {
        pending = intent
        sendEvent("onShare", mapOf("at" to System.currentTimeMillis().toDouble()))
      }
    }

    AsyncFunction("take") {
      val launch = appContext.currentActivity?.intent
      val intent = pending ?: launch?.takeIf { isShare(it) && !it.getBooleanExtra(TAKEN, false) }
      pending = null
      if (intent == null) {
        return@AsyncFunction emptyList<Map<String, Any?>>()
      }
      intent.putExtra(TAKEN, true)
      read(intent)
    }
  }

  private fun isShare(intent: Intent?): Boolean =
    intent != null && (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE)

  @Suppress("DEPRECATION")
  private fun streams(intent: Intent): List<Uri> {
    val out = mutableListOf<Uri>()
    if (intent.action == Intent.ACTION_SEND) {
      val one: Uri? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM)
      if (one != null) out.add(one)
    } else {
      val many: List<Uri>? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
      if (many != null) out.addAll(many)
    }
    // Some apps only put them in the clip data.
    val clip = intent.clipData
    if (out.isEmpty() && clip != null) {
      for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { out.add(it) }
    }
    return out
  }

  private fun read(intent: Intent): List<Map<String, Any?>> {
    val ctx = context ?: return emptyList()
    val dir = File(ctx.cacheDir, "shared")
    dir.mkdirs()
    // Shares from before today are gone by now.
    val dayAgo = System.currentTimeMillis() - 24 * 60 * 60 * 1000
    dir.listFiles()?.forEach { if (it.lastModified() < dayAgo) it.delete() }

    val out = mutableListOf<Map<String, Any?>>()
    for (uri in streams(intent).take(MAX_FILES)) {
      try {
        var name: String? = null
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
          if (c.moveToFirst()) {
            val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (i >= 0) name = c.getString(i)
          }
        }
        val dest = freeFile(dir, clean(name ?: uri.lastPathSegment ?: "file"))
        val input = ctx.contentResolver.openInputStream(uri) ?: continue
        input.use { src -> dest.outputStream().use { src.copyTo(it) } }
        out.add(item(dest, ctx.contentResolver.getType(uri) ?: intent.type))
      } catch (e: Exception) {
        // One that can't be read is left out.
      }
    }
    if (out.isEmpty()) {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT)
      if (!text.isNullOrBlank()) {
        val title = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: text.lineSequence().first()
        val dest = freeFile(dir, clean(title.take(40)).ifBlank { "Shared text" } + ".txt")
        dest.writeText(text)
        out.add(item(dest, "text/plain"))
      }
    }
    return out
  }

  private fun item(f: File, mime: String?): Map<String, Any?> =
    mapOf("uri" to Uri.fromFile(f).toString(), "name" to f.name, "size" to f.length().toDouble(), "mimeType" to mime)

  private fun clean(name: String): String =
    name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().trimStart('.').ifBlank { "file" }

  private fun freeFile(dir: File, name: String): File {
    var f = File(dir, name)
    val dot = name.lastIndexOf('.')
    var n = 2
    while (f.exists()) {
      f = File(dir, if (dot > 0) "${name.substring(0, dot)} ($n)${name.substring(dot)}" else "$name ($n)")
      n++
    }
    return f
  }

  companion object {
    private const val TAKEN = "islanddrop.taken"
    private const val MAX_FILES = 20
  }
}
