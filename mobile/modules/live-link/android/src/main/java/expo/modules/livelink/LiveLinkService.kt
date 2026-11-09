package expo.modules.livelink

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * A foreground service whose only job is to keep the app's process (and so
 * its link to your computer's island) alive in the background, with a quiet
 * ongoing notification: the island in a line ("Orbit · 2 waiting for you"),
 * which is also what the lock screen shows, without the details. On Android
 * 16 it asks to be a Live Update (a chip in the status bar with what's
 * waiting). The app updates it.
 */
class LiveLinkService : Service() {
  companion object {
    /** Silent, but on the lock screen and in the status bar (the old one, "live_link", was hidden there). */
    const val CHANNEL_ID = "island_live"
    private const val OLD_CHANNEL_ID = "live_link"
    const val NOTIFICATION_ID = 4712
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_CHIP = "chip"
    const val EXTRA_LOCK = "lock"

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(OLD_CHANNEL_ID) != null) manager.deleteNotificationChannel(OLD_CHANNEL_ID)
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(CHANNEL_ID, "Your island", NotificationManager.IMPORTANCE_LOW)
      channel.description = "What your computer's island is doing, quietly, in the status bar and on the lock screen"
      channel.setShowBadge(false)
      channel.setSound(null, null)
      channel.enableVibration(false)
      channel.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
      manager.createNotificationChannel(channel)
    }

    private fun builder(context: Context): Notification.Builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }

    /** Android 16's Live Update: kept at the top, with a chip in the status bar. Asked for by name, so older SDKs build too. */
    private fun promote(b: Notification.Builder, chip: String?) {
      if (Build.VERSION.SDK_INT < 36) return
      try {
        b.javaClass.getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType).invoke(b, true)
        if (!chip.isNullOrEmpty()) b.javaClass.getMethod("setShortCriticalText", CharSequence::class.java).invoke(b, chip)
      } catch (e: Exception) {
        // this phone doesn't have it: a plain ongoing notification
      }
    }

    /**
     * `title` and `text` show unlocked; `lock` (just what the island is doing,
     * no names) is all the lock screen shows; `chip` is what's waiting.
     */
    fun build(context: Context, title: String, text: String, chip: String? = null, lock: String? = null): Notification {
      ensureChannel(context)
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val open = PendingIntent.getActivity(
        context,
        0,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val minimal = builder(context)
        .setContentTitle(lock ?: title)
        .setSmallIcon(context.applicationInfo.icon)
        .setOngoing(true)
        .setShowWhen(false)
        .build()
      val b = builder(context)
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentIntent(open)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(Notification.CATEGORY_STATUS)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setPublicVersion(minimal)
      promote(b, chip)
      return b.build()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Island Drop"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Connecting…"
    val notification = build(this, title, text, intent?.getStringExtra(EXTRA_CHIP), intent?.getStringExtra(EXTRA_LOCK))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    // If Android kills the app, don't come back on our own: nothing would be connected.
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping the app away stops it.
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }
}
