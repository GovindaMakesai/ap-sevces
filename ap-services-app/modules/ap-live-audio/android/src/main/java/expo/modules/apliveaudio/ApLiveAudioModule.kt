package expo.modules.apliveaudio

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Fixes live voice silence on Bluetooth headsets.
 *
 * Root cause: expo-av `playThroughEarpieceAndroid: false` maps to
 * AudioManager.setSpeakerphoneOn(true), which steals the route from A2DP/SCO
 * so WebView/Agora remote audio is inaudible on many OEMs.
 */
class ApLiveAudioModule : Module() {
  private fun reactCtx(): Context {
    return requireNotNull(appContext.reactContext) { "React context is null" }
  }

  private fun audioManager(): AudioManager {
    return reactCtx().getSystemService(Context.AUDIO_SERVICE) as AudioManager
  }

  private fun canUseBluetooth(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return ContextCompat.checkSelfPermission(
      reactCtx(),
      android.Manifest.permission.BLUETOOTH_CONNECT
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun bluetoothDevices(am: AudioManager): List<AudioDeviceInfo> {
    val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    return devices.filter {
      it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
        it.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
        it.type == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
        (Build.VERSION.SDK_INT >= 34 && it.type == AudioDeviceInfo.TYPE_BLE_BROADCAST)
    }
  }

  private fun hasBluetooth(am: AudioManager): Boolean {
    return try {
      bluetoothDevices(am).isNotEmpty() || am.isBluetoothA2dpOn || am.isBluetoothScoOn
    } catch (_: Throwable) {
      false
    }
  }

  private fun stopSco(am: AudioManager) {
    try {
      @Suppress("DEPRECATION")
      if (am.isBluetoothScoOn) {
        @Suppress("DEPRECATION")
        am.stopBluetoothSco()
        @Suppress("DEPRECATION")
        am.isBluetoothScoOn = false
      }
    } catch (_: Throwable) {
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ApLiveAudio")

    Function("hasBluetoothAudio") {
      try {
        hasBluetooth(audioManager())
      } catch (_: Throwable) {
        false
      }
    }

    AsyncFunction("preferBluetoothPlayback") {
      preferPlayback()
    }

    AsyncFunction("preferBluetoothTalk") {
      preferTalk()
    }

    AsyncFunction("clearRouteOverrides") {
      clearOverrides()
    }
  }

  /**
   * Audience / listen path: turn speakerphone OFF and leave media on A2DP.
   * Do NOT setCommunicationDevice for A2DP — that API is for call/SCO paths
   * and can break WebView media playback.
   */
  private fun preferPlayback(): Map<String, Any?> {
    val am = audioManager()
    val bt = hasBluetooth(am)
    try {
      am.isSpeakerphoneOn = false
    } catch (_: Throwable) {
    }

    if (!bt) {
      return mapOf("ok" to true, "bluetooth" to false, "mode" to "playback", "device" to "default")
    }

    /* Clear any prior communication-device lock so system can use A2DP for media. */
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        am.clearCommunicationDevice()
      }
    } catch (_: Throwable) {
    }
    stopSco(am)

    val name = try {
      bluetoothDevices(am).firstOrNull()?.productName?.toString()
    } catch (_: Throwable) {
      null
    }

    return mapOf(
      "ok" to true,
      "bluetooth" to true,
      "mode" to "playback",
      "device" to (name ?: "bt-a2dp"),
      "permission" to canUseBluetooth()
    )
  }

  /** Host / seat mic on BT headset — prefer SCO / communication device. */
  private fun preferTalk(): Map<String, Any?> {
    val am = audioManager()
    val bt = hasBluetooth(am)
    try {
      am.isSpeakerphoneOn = false
    } catch (_: Throwable) {
    }

    if (!bt) {
      return mapOf("ok" to true, "bluetooth" to false, "mode" to "talk", "device" to "default")
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val devices = bluetoothDevices(am)
      val preferred =
        devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
          ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLE_HEADSET }
          ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
          ?: devices.firstOrNull()
      if (preferred != null) {
        val ok = try {
          am.setCommunicationDevice(preferred)
        } catch (_: Throwable) {
          false
        }
        return mapOf(
          "ok" to ok,
          "bluetooth" to true,
          "mode" to "talk",
          "device" to preferred.productName?.toString(),
          "type" to preferred.type
        )
      }
    } else {
      try {
        @Suppress("DEPRECATION")
        am.startBluetoothSco()
        @Suppress("DEPRECATION")
        am.isBluetoothScoOn = true
      } catch (_: Throwable) {
      }
    }

    return mapOf("ok" to true, "bluetooth" to true, "mode" to "talk", "device" to "bt-sco")
  }

  private fun clearOverrides(): Map<String, Any?> {
    val am = audioManager()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        am.clearCommunicationDevice()
      }
    } catch (_: Throwable) {
    }
    stopSco(am)
    try {
      am.isSpeakerphoneOn = false
    } catch (_: Throwable) {
    }
    return mapOf("ok" to true)
  }
}
