package expo.modules.islandwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * The home screen widget: the island's orb, what it's doing and the link to
 * your computer. The app writes what to show (IslandWidgetModule.update);
 * the widget draws the last of it, so it still says something sensible
 * while the app isn't running. Tapping it opens the app.
 */
class IslandWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) render(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    render(context, manager, id)
  }

  /** What the app last said to show (both widgets read it). */
  class Shown(
    val line: String,
    val detail: String,
    val color: Int,
    val ring: Int?,
    val dim: Boolean,
    val name: String,
    /** A few capitals for the dot widget: "2 WAITING", "RESTING". */
    val word: String,
    val computer: String,
    /** Something needs you (the dot widget's red dot). */
    val alert: Boolean,
  )

  companion object {
    const val PREFS = "island_widget"
    const val KEY = "state"

    fun ids(context: Context): IntArray =
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, IslandWidgetProvider::class.java))

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for (id in ids(context)) render(context, manager, id)
      IslandDotsWidgetProvider.updateAll(context)
    }

    private fun color(s: String?, fallback: Int?): Int? =
      try {
        if (s.isNullOrEmpty()) fallback else Color.parseColor(s)
      } catch (e: IllegalArgumentException) {
        fallback
      }

    fun shown(context: Context): Shown {
      val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
      val coral = Color.parseColor("#ff8a65")
      if (raw == null) return Shown("Open Island Drop", "Pair it with your computer", coral, null, true, "Island", "PAIR ME", "", false)
      return try {
        val j = JSONObject(raw)
        Shown(
          j.optString("line", "Island"),
          j.optString("detail", ""),
          color(j.optString("color"), coral) ?: coral,
          if (j.isNull("ring")) null else color(j.optString("ring"), null),
          j.optBoolean("dim", false),
          j.optString("name", "Orbit"),
          j.optString("word", "RESTING"),
          j.optString("computer", ""),
          j.optBoolean("alert", false),
        )
      } catch (e: Exception) {
        Shown("Island", "", coral, null, false, "Island", "ISLAND", "", false)
      }
    }

    fun render(context: Context, manager: AppWidgetManager, id: Int) {
      val s = shown(context)
      val width = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
      val small = width in 1..179
      val views = RemoteViews(context.packageName, if (small) R.layout.island_widget_small else R.layout.island_widget)
      val dark = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
      val px = ((if (small) 36 else 52) * context.resources.displayMetrics.density).toInt()
      views.setImageViewBitmap(R.id.island_widget_orb, OrbBitmap.draw(px, s.color, s.ring, dark, s.dim))
      views.setTextViewText(R.id.island_widget_line, s.line)
      if (!small) views.setTextViewText(R.id.island_widget_detail, s.detail)
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
        val open = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        views.setOnClickPendingIntent(R.id.island_widget_root, open)
      }
      manager.updateAppWidget(id, views)
    }
  }
}
