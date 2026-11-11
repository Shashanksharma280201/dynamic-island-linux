package expo.modules.islandwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import android.widget.RemoteViews

/** The dot widget (DotBitmap): the same island as IslandWidgetProvider, in dot matrix. */
class IslandDotsWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) render(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    render(context, manager, id)
  }

  companion object {
    fun ids(context: Context): IntArray =
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, IslandDotsWidgetProvider::class.java))

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for (id in ids(context)) render(context, manager, id)
    }

    fun render(context: Context, manager: AppWidgetManager, id: Int) {
      val s = IslandWidgetProvider.shown(context)
      val options = manager.getAppWidgetOptions(id)
      val density = context.resources.displayMetrics.density
      // Portrait: the widget is as wide as its smallest width and as tall as its largest height.
      val wDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0).takeIf { it > 0 } ?: 160
      val hDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0).takeIf { it > 0 } ?: 160
      val scale = minOf(density, 900f / maxOf(wDp, hDp))
      val dark = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
      val views = RemoteViews(context.packageName, R.layout.island_widget_dots)
      views.setImageViewBitmap(R.id.island_dots_image, DotBitmap.draw((wDp * scale).toInt(), (hDp * scale).toInt(), s.name, s.word, s.computer, s.alert, s.dim, dark))
      views.setContentDescription(R.id.island_dots_image, "${s.name}: ${s.line}")
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
        val open = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        views.setOnClickPendingIntent(R.id.island_dots_root, open)
      }
      manager.updateAppWidget(id, views)
    }
  }
}
