package expo.modules.islandwidget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The orb as a still picture, for the widget: a globe of dots in its colour,
 * the ones at the back smaller and fading, inside the mood's ring when it has
 * one. On a light background the ink is a deeper shade (as in the app).
 */
object OrbBitmap {
  private class Dot(val x: Float, val y: Float, val z: Float)

  /** The dots on a sphere (a Fibonacci spiral), tilted so the poles aren't head on, back to front. */
  private val dots: List<Dot> by lazy {
    val n = 150
    val golden = PI * (3 - sqrt(5.0))
    val tilt = 0.5
    (0 until n).map { i ->
      val y = 1 - (i + 0.5) / n * 2
      val r = sqrt(1 - y * y)
      val th = golden * i + 0.6
      val x = cos(th) * r
      val z = sin(th) * r
      Dot(x.toFloat(), (y * cos(tilt) - z * sin(tilt)).toFloat(), (y * sin(tilt) + z * cos(tilt)).toFloat())
    }.sortedBy { it.z }
  }

  fun draw(sizePx: Int, color: Int, ring: Int?, dark: Boolean, dim: Boolean): Bitmap {
    val size = sizePx.coerceAtLeast(16)
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val c = size / 2f
    val stroke = size * 0.045f
    if (ring != null) {
      paint.style = Paint.Style.STROKE
      paint.strokeWidth = stroke
      paint.color = ring
      canvas.drawCircle(c, c, c - stroke, paint)
      paint.style = Paint.Style.FILL
    }
    val radius = if (ring != null) size * 0.33f else size * 0.42f
    val ink = if (dark) color else shade(color, 0.74f)
    val fade = if (dim) 0.45f else 1f
    for (d in dots) {
      val front = (d.z + 1) / 2
      val w = 1 - front
      paint.color = depth(ink, w, dark)
      paint.alpha = (255 * (0.4f + 0.6f * front) * fade).toInt()
      canvas.drawCircle(c + d.x * radius, c + d.y * radius, size * (0.011f + 0.017f * front), paint)
    }
    return bmp
  }

  private fun shade(c: Int, k: Float) = Color.rgb((Color.red(c) * k).toInt(), (Color.green(c) * k).toInt(), (Color.blue(c) * k).toInt())

  /** Toward the background with depth, only partly (as the island draws it). */
  private fun depth(c: Int, w: Float, dark: Boolean): Int {
    fun f(v: Int) = if (dark) (v * (1 - w * 0.55f)).toInt() else (v + (255 - v) * w * 0.45f).toInt()
    return Color.rgb(f(Color.red(c)), f(Color.green(c)), f(Color.blue(c)))
  }
}
