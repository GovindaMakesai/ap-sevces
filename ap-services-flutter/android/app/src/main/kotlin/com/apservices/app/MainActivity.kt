package com.apservices.app

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
import android.view.WindowManager
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Native shell ported from ap-services-app:
 * - ApLiveAudio (Bluetooth routing for live rooms)
 * - FLAG_SECURE on live/party screens
 *
 * WebRTC / Agora communication mode disables A2DP. Listeners with a
 * Bluetooth headset must use SCO/HFP or they hear nothing.
 */
class MainActivity : FlutterActivity() {
    private val apLiveAudioChannel = "com.apservices.app/ap_live_audio"
    private val secureScreenChannel = "com.apservices.app/secure_screen"
    private var lastKind: String? = null
    private var deviceCallback: AudioDeviceCallback? = null
    private var voiceFocusRequest: AudioFocusRequest? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, secureScreenChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "setSecure" -> {
                        val enabled = call.argument<Boolean>("enabled") ?: false
                        runOnUiThread {
                            if (enabled) {
                                window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                            } else {
                                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                            }
                        }
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, apLiveAudioChannel)
            .setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "hasBluetoothAudio" -> result.success(hasBluetoothAudio())
                        "preferBluetoothPlayback" -> result.success(preferBluetoothPlayback())
                        "preferBluetoothTalk" -> result.success(preferBluetoothTalk())
                        "clearRouteOverrides" -> result.success(clearRouteOverrides())
                        else -> result.notImplemented()
                    }
                } catch (e: Throwable) {
                    result.error("ap_live_audio", e.message, null)
                }
            }
    }

    private fun audioManager(): AudioManager {
        return getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    private fun canUseBluetooth(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return ContextCompat.checkSelfPermission(
            this,
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
            "talk" -> preferBluetoothTalk()
            "playback" -> preferBluetoothPlayback()
        }
    }

    private fun hasBluetoothAudio(): Boolean {
        return try {
            hasBluetooth(audioManager())
        } catch (_: Throwable) {
            false
        }
    }

    private fun preferBluetoothPlayback(): Map<String, Any?> {
        val am = audioManager()
        val bt = hasBluetooth(am)
        if (!bt) {
            return routeToSpeaker(am, "playback")
        }
        if (hasHeadsetMicPath(am) || am.isBluetoothScoOn) {
            return routeToHeadset(am, "playback")
        }
        return routeA2dpOnly(am, "playback")
    }

    private fun preferBluetoothTalk(): Map<String, Any?> {
        val am = audioManager()
        val bt = hasBluetooth(am)
        if (!bt) {
            return routeToSpeaker(am, "talk")
        }
        return routeToHeadset(am, "talk")
    }

    private fun clearRouteOverrides(): Map<String, Any?> {
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
