package com.apservices.aplive.camerakit

import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.apservices.aplive.BuildConfig
import com.snap.camerakit.support.app.CameraActivity

/**
 * Launches Snap's official CameraActivity (carousel + preview).
 * Demo Lens Group lenses are sample AR effects — not the consumer Snapchat beauty pack.
 * Add beauty lenses in My Lenses → Lens Scheduler, then put that group ID in
 * android/camerakit.local.properties.
 *
 * Not connected to Agora / Go Live streaming pipeline yet.
 */
class CameraKitTestActivity : AppCompatActivity() {

  private val captureLauncher =
    registerForActivityResult(CameraActivity.Capture) { result ->
      Log.d(TAG, "CameraActivity result: $result")
      finish()
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (!BuildConfig.DEBUG) {
      toast("Camera Kit Test is DEBUG-only.")
      finish()
      return
    }

    if (!BuildConfig.SNAP_CAMERA_KIT_CONFIGURED) {
      toast("Missing Staging credentials in camerakit.local.properties")
      finish()
      return
    }

    val groupId = BuildConfig.SNAP_CAMERA_KIT_DEMO_LENS_GROUP_ID.trim()
    if (groupId.isEmpty()) {
      toast("Demo Lens Group ID is empty.")
      finish()
      return
    }

    val token = readApiToken()
    if (token.isEmpty()) {
      toast("Camera Kit API token missing from manifest.")
      finish()
      return
    }

    try {
      captureLauncher.launch(
        CameraActivity.Configuration.WithLenses(
          cameraKitApiToken = token,
          lensGroupIds = arrayOf(groupId),
          cameraFacingFront = true,
          cameraFacingFlipEnabled = true,
          // Prefetch every lens so swiping the carousel is not a white flash.
          prefetchLensByIdPattern = "\\S+",
          // Allow idle (no lens) so users can see raw camera, then pick a filter.
          disableIdleState = false,
        )
      )
    } catch (t: Throwable) {
      Log.e(TAG, "Failed to launch CameraActivity", t)
      toast("Could not open Snap lenses: ${t.message ?: t.javaClass.simpleName}")
      finish()
    }
  }

  private fun readApiToken(): String {
    return try {
      val info = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
      info.metaData?.getString("com.snap.camerakit.api.token")?.trim().orEmpty()
    } catch (t: Throwable) {
      Log.e(TAG, "readApiToken failed", t)
      ""
    }
  }

  private fun toast(msg: String) {
    Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
  }

  companion object {
    private const val TAG = "CameraKitTest"
  }
}
