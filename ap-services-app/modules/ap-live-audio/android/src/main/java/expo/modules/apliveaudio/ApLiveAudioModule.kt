package expo.modules.apliveaudio

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Live / party audio routing for WebView + Agora.
 *
 * WebRTC puts Android in MODE_IN_COMMUNICATION, which disables A2DP.
 * Stopping SCO in that mode leaves Bluetooth headsets silent. Listeners
 * with a headset must use SCO/HFP (same as talk). Phone speaker is used
 * only when no Bluetooth output is present.
 */
class ApLiveAudioModule : Module() {
  private var lastKind: String? = null
  private var deviceCallback: AudioDeviceCallback? = null
  private var voiceFocusRequest: AudioFocusRequest? = null

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

  private fun isBtType(type: Int): Boolean {
    return type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
      type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
      type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
      type == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
      (Build.VERSION.SDK_INT >= 34 && type == AudioDeviceInfo.TYPE_BLE_BROADCAST)
  }

  private fun bluetoothDevices(am: AudioManager): List<AudioDeviceInfo> {
    val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    return devices.filter { isBtType(it.type) }
  }

  private fun hasBluetooth(am: AudioManager): Boolean {
    return try {
      bluetoothDevices(am).isNotEmpty() || am.isBluetoothA2dpOn || am.isBluetoothScoOn
    } catch (_: Throwable) {
      false
    }
  }

  private fun hasHeadsetMicPath(am: AudioManager): Boolean {
    return bluetoothDevices(am).any {
      it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
        it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
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

  private fun startSco(am: AudioManager) {
    try {
      @Suppress("DEPRECATION")
      am.startBluetoothSco()
      @Suppress("DEPRECATION")
      am.isBluetoothScoOn = true
    } catch (_: Throwable) {
    }
  }

  private fun requestVoiceFocus(am: AudioManager) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          .setAcceptsDelayedFocusGain(true)
          .build()
        voiceFocusRequest = req
        am.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        am.requestAudioFocus(
          null,
          AudioManager.STREAM_VOICE_CALL,
          AudioManager.AUDIOFOCUS_GAIN
        )
      }
    } catch (_: Throwable) {
    }
  }

  private fun requestMediaFocus(am: AudioManager) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          .build()
        voiceFocusRequest = req
        am.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        am.requestAudioFocus(
          null,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN
        )
      }
    } catch (_: Throwable) {
    }
  }

  private fun routeToHeadset(am: AudioManager, mode: String): Map<String, Any?> {
    requestVoiceFocus(am)
    try {
      am.mode = AudioManager.MODE_IN_COMMUNICATION
    } catch (_: Throwable) {
    }
    try {
      am.isSpeakerphoneOn = false
    } catch (_: Throwable) {
    }

    var deviceName: String? = null
    var deviceType: Int? = null
    var ok = true
    val devices = bluetoothDevices(am)
    val preferred =
      devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
        ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLE_HEADSET }
        ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
        ?: devices.firstOrNull()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && preferred != null) {
      deviceName = preferred.productName?.toString()
      deviceType = preferred.type
      ok = try {
        am.setCommunicationDevice(preferred)
      } catch (_: Throwable) {
        false
      }
    }

    /* Classic HFP: SCO is required once WebRTC is in communication mode. */
    if (hasHeadsetMicPath(am) || preferred == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      startSco(am)
    }

    lastKind = mode
    ensureDeviceCallback()
    return mapOf(
      "ok" to ok,
      "bluetooth" to true,
      "mode" to mode,
      "device" to (deviceName ?: "bt-sco"),
      "type" to deviceType,
      "permission" to canUseBluetooth(),
      "route" to "bt-sco-listen"
    )
  }

  private fun routeToSpeaker(am: AudioManager, mode: String): Map<String, Any?> {
    requestMediaFocus(am)
    try {
      am.mode = AudioManager.MODE_NORMAL
    } catch (_: Throwable) {
    }
    try {
      am.isSpeakerphoneOn = true
    } catch (_: Throwable) {
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        am.clearCommunicationDevice()
      }
    } catch (_: Throwable) {
    }
    stopSco(am)
    lastKind = mode
    ensureDeviceCallback()
    return mapOf(
      "ok" to true,
      "bluetooth" to false,
      "mode" to mode,
      "device" to "speaker",
      "permission" to canUseBluetooth(),
      "route" to "speaker"
    )
  }

  private fun routeA2dpOnly(am: AudioManager, mode: String): Map<String, Any?> {
    requestMediaFocus(am)
    try {
      am.mode = AudioManager.MODE_NORMAL
    } catch (_: Throwable) {
    }
    try {
      am.isSpeakerphoneOn = false
    } catch (_: Throwable) {
    }
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
    lastKind = mode
    ensureDeviceCallback()
    return mapOf(
      "ok" to true,
      "bluetooth" to true,
      "mode" to mode,
      "device" to (name ?: "bt-a2dp"),
      "permission" to canUseBluetooth(),
      "route" to "bt-a2dp"
    )
  }

  private fun ensureDeviceCallback() {
    if (deviceCallback != null) return
    val cb = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<AudioDeviceInfo>) {
        if (addedDevices.any { isBtType(it.type) }) reapplyLast()
      }

      override fun onAudioDevicesRemoved(removedDevices: Array<AudioDeviceInfo>) {
        if (removedDevices.any { isBtType(it.type) }) reapplyLast()
      }
    }
    try {
      audioManager().registerAudioDeviceCallback(cb, Handler(Looper.getMainLooper()))
      deviceCallback = cb
    } catch (_: Throwable) {
    }
  }

  private fun reapplyLast() {
    when (lastKind) {
      "talk" -> preferTalk()
      "playback" -> preferPlayback()
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
   * Audience / Android host listen path.
   * Bluetooth: SCO/HFP so WebRTC communication mode still has an output.
   * A2DP-only speakers: MODE_NORMAL. No headset: phone speaker.
   */
  private fun preferPlayback(): Map<String, Any?> {
    val am = audioManager()
    val bt = hasBluetooth(am)
    if (!bt) {
      return routeToSpeaker(am, "playback")
    }
    if (hasHeadsetMicPath(am) || am.isBluetoothScoOn) {
      return routeToHeadset(am, "playback")
    }
    /* Music-only A2DP device — keep media path; WebRTC may still steal it. */
    return routeA2dpOnly(am, "playback")
  }

  /** Host / seat mic on BT headset — SCO / communication device. */
  private fun preferTalk(): Map<String, Any?> {
    val am = audioManager()
    val bt = hasBluetooth(am)
    if (!bt) {
      return routeToSpeaker(am, "talk")
    }
    return routeToHeadset(am, "talk")
  }

  private fun clearOverrides(): Map<String, Any?> {
    val am = audioManager()
    lastKind = null
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        am.clearCommunicationDevice()
      }
    } catch (_: Throwable) {
    }
    stopSco(am)
    try {
      am.mode = AudioManager.MODE_NORMAL
    } catch (_: Throwable) {
    }
    try {
      am.isSpeakerphoneOn = false
    } catch (_: Throwable) {
    }
    return mapOf("ok" to true)
  }
}
