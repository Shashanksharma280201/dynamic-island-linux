package expo.modules.islandwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** What the home screen widget shows (the app tells it), and adding it to the home screen. */
class IslandWidgetModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("IslandWidget")

    /** Save what to show and redraw every widget (does nothing much when there's none). */
    Function("update") { json: String ->
      context.getSharedPreferences(IslandWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().putString(IslandWidgetProvider.KEY, json).apply()
      if (IslandWidgetProvider.ids(context).isNotEmpty()) IslandWidgetProvider.updateAll(context)
    }

    /** How many are on the home screen. */
    Function("count") {
      IslandWidgetProvider.ids(context).size
    }

    /** Ask the launcher to add one (Android 8 and later, where the launcher allows it). */
    Function("add") {
      val manager = AppWidgetManager.getInstance(context)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.isRequestPinAppWidgetSupported) {
        manager.requestPinAppWidget(ComponentName(context, IslandWidgetProvider::class.java), null, null)
      } else {
        false
      }
    }
  }
}
