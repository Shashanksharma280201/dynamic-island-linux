package expo.modules.islandwidget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * The dot widget, in the dot-matrix style of Nothing phones (it looks at home
 * on any phone): the orb as a grid of dots lit from the top left, what it's
 * doing in dot letters, in black and white, with a red dot when something
 * needs you. Drawn whole as one picture, at the widget's size.
 */
object DotBitmap {
  /** Nothing's red, for "needs you". */
  private const val RED = 0xFFD71921.toInt()

  /** A 5 by 7 dot font: capitals, digits and a little punctuation, one row per string. */
  private val FONT: Map<Char, Array<String>> = mapOf(
    'A' to arrayOf(".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    'B' to arrayOf("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),
    'C' to arrayOf(".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
    'D' to arrayOf("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
    'E' to arrayOf("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
    'F' to arrayOf("#####", "#....", "#....", "####.", "#....", "#....", "#...."),
    'G' to arrayOf(".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"),
    'H' to arrayOf("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    'I' to arrayOf(".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."),
    'J' to arrayOf("..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."),
    'K' to arrayOf("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
    'L' to arrayOf("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
    'M' to arrayOf("#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"),
    'N' to arrayOf("#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"),
    'O' to arrayOf(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    'P' to arrayOf("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
    'Q' to arrayOf(".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),
    'R' to arrayOf("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
    'S' to arrayOf(".###.", "#...#", "#....", ".###.", "....#", "#...#", ".###."),
    'T' to arrayOf("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
    'U' to arrayOf("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    'V' to arrayOf("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),
    'W' to arrayOf("#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."),
    'X' to arrayOf("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),
    'Y' to arrayOf("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
    'Z' to arrayOf("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),
    '0' to arrayOf(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),
    '1' to arrayOf("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),
    '2' to arrayOf(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),
    '3' to arrayOf("#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."),
    '4' to arrayOf("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),
    '5' to arrayOf("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
    '6' to arrayOf("..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."),
    '7' to arrayOf("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
    '8' to arrayOf(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),
    '9' to arrayOf(".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."),
    '-' to arrayOf(".....", ".....", ".....", "#####", ".....", ".....", "....."),
    '+' to arrayOf(".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."),
    '.' to arrayOf(".....", ".....", ".....", ".....", ".....", ".##..", ".##.."),
  )

  /** Dot columns a text takes (5 a letter, 1 between, 3 for a space). */
  fun columns(text: String): Int {
    var n = 0
    text.forEachIndexed { i, c -> n += if (c == ' ') 3 else 5; if (i < text.length - 1) n += 1 }
    return n
  }

  /** Text in dots, its top left at (x, y), each dot `pitch` apart. */
  private fun text(canvas: Canvas, paint: Paint, s: String, x: Float, y: Float, pitch: Float) {
    var cx = x
    val r = pitch * 0.38f
    for (ch in s.uppercase()) {
      if (ch == ' ') {
        cx += pitch * 4
        continue
      }
      val rows = FONT[ch]
      if (rows != null) {
        rows.forEachIndexed { row, line ->
          line.forEachIndexed { col, on -> if (on == '#') canvas.drawCircle(cx + col * pitch + pitch / 2, y + row * pitch + pitch / 2, r, paint) }
        }
      }
      cx += pitch * 6
    }
  }

  /** The orb as a grid of dots: lit from the top left, the dark side faint, as if a sphere in dot matrix. */
  private fun orb(canvas: Canvas, paint: Paint, ink: Int, cx: Float, cy: Float, radius: Float, dim: Boolean) {
    val n = 13
    val pitch = radius * 2 / n
    val lx = -0.5f; val ly = -0.6f; val lz = 0.62f
    val ll = sqrt(lx * lx + ly * ly + lz * lz)
    for (i in 0 until n) for (j in 0 until n) {
      val x = (i + 0.5f) / n * 2 - 1
      val y = (j + 0.5f) / n * 2 - 1
      val d2 = x * x + y * y
      if (d2 > 1f) continue
      val z = sqrt(1 - d2)
      val lit = max(0f, (x * lx + y * ly + z * lz) / ll)
      val b = 0.18f + 0.82f * lit
      paint.color = ink
      paint.alpha = (255 * b * (if (dim) 0.45f else 1f)).toInt()
      canvas.drawCircle(cx - radius + (i + 0.5f) * pitch, cy - radius + (j + 0.5f) * pitch, pitch * (0.16f + 0.24f * b), paint)
    }
  }

  /**
   * The whole widget at `w` by `h` pixels: square, the orb above and the
   * word below; wide, the orb at the left and the words beside it.
   */
  fun draw(w: Int, h: Int, name: String, word: String, detail: String, alert: Boolean, dim: Boolean, dark: Boolean): Bitmap {
    val width = max(48, w)
    val height = max(48, h)
    val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val bg = if (dark) Color.BLACK else Color.WHITE
    val ink = if (dark) Color.WHITE else Color.BLACK
    val faint = if (dark) Color.argb(150, 255, 255, 255) else Color.argb(150, 0, 0, 0)
    val s = min(width, height).toFloat()
    paint.color = bg
    canvas.drawRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), s * 0.16f, s * 0.16f, paint)
    val pad = s * 0.1f
    val wide = width > height * 1.6f
    if (!wide) {
      // Square: the name small at the top, the orb, the word below.
      val small = s / 92
      paint.color = faint
      text(canvas, paint, name, pad, pad, small)
      if (alert) {
        paint.color = RED
        canvas.drawCircle(width - pad - s * 0.03f, pad + small * 3.5f, s * 0.03f, paint)
      }
      orb(canvas, paint, ink, width / 2f, height * 0.47f, s * 0.24f, dim)
      val pitch = min(s / 70, (width - pad * 2) / max(1, columns(word)))
      paint.color = if (alert) RED else ink
      text(canvas, paint, word, (width - columns(word) * pitch) / 2, height - pad - pitch * 7, pitch)
    } else {
      // Wide: the orb at the left, the name, the word and the detail beside it.
      val r = height * 0.32f
      orb(canvas, paint, ink, pad + r, height / 2f, r, dim)
      val x = pad + r * 2 + s * 0.14f
      val room = width - x - pad
      val big = min(height / 26f, room / max(1, columns(word)))
      val small = min(height / 46f, room / max(1, columns(detail)))
      paint.color = faint
      text(canvas, paint, name, x, height / 2f - big * 3.5f - small * 10, small)
      paint.color = if (alert) RED else ink
      text(canvas, paint, word, x, height / 2f - big * 3.5f, big)
      paint.color = faint
      text(canvas, paint, detail, x, height / 2f + big * 3.5f + small * 3, small)
      if (alert) {
        paint.color = RED
        canvas.drawCircle(width - pad - s * 0.04f, pad + s * 0.04f, s * 0.04f, paint)
      }
    }
    return bmp
  }
}
