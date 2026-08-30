package com.apservices.aplive.camerakit

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.apservices.aplive.BuildConfig

class CameraKitTestModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CameraKitTest"

  @ReactMethod
  fun openTest(promise: Promise) {
    try {
      if (!BuildConfig.DEBUG) {
        promise.reject("E_DEBUG_ONLY", "Camera Kit Test is available in debug builds only.")
        return
      }
      UiThreadUtil.runOnUiThread {
        try {
          val activity = reactContext.currentActivity
          if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No foreground activity to launch Camera Kit Test.")
            return@runOnUiThread
          }
          val intent = Intent(activity, CameraKitTestActivity::class.java)
          activity.startActivity(intent)
          promise.resolve(true)
        } catch (t: Throwable) {
          promise.reject("E_OPEN_FAILED", t.message ?: "Failed to open Camera Kit Test", t)
        }
      }
    } catch (t: Throwable) {
      promise.reject("E_OPEN_FAILED", t.message ?: "Failed to open Camera Kit Test", t)
    }
  }
}
