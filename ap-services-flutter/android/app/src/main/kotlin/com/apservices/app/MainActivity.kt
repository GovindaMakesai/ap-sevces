package com.apservices.app

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.view.WindowManager
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Native shell ported from ap-services-app:
 * - ApLiveAudio (Bluetooth routing for live rooms)
 * - FLAG_SECURE on live/party screens
 */
class MainActivity : FlutterActivity() {
    private val apLiveAudioChannel = "com.apservices.app/ap_live_audio"
    private val secureScreenChannel = "com.apservices.app/secure_screen"

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
        try {
            am.isSpeakerphoneOn = false
        } catch (_: Throwable) {
        }

        if (!bt) {
            return mapOf("ok" to true, "bluetooth" to false, "mode" to "playback", "device" to "default")
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

        return mapOf(
            "ok" to true,
            "bluetooth" to true,
            "mode" to "playback",
            "device" to (name ?: "bt-a2dp"),
            "permission" to canUseBluetooth()
        )
    }

    private fun preferBluetoothTalk(): Map<String, Any?> {
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

    private fun clearRouteOverrides(): Map<String, Any?> {
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
