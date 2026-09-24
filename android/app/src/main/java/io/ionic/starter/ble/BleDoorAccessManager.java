package io.ionic.starter.ble;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * BleDoorAccessManager manages BLE GATT Server and Advertising on the Intercom terminal.
 * It listens for authorized resident unlock requests from the IFS360 mobile app,
 * verifies the short-lived access token against the backend (/api/qr with access_type=bluetooth),
 * and triggers door unlocking via DoorUnlockCallback.
 */
public class BleDoorAccessManager {

    private static final String TAG = "BleDoorAccessManager";

    // IFS360 Dedicated 128-bit UUIDs
    public static final UUID SERVICE_UUID = UUID.fromString("1fa89f00-34b2-4d7a-b9c2-75d82084c7e1");
    public static final UUID CHAR_UNLOCK_UUID = UUID.fromString("1fa89f01-34b2-4d7a-b9c2-75d82084c7e1");
    public static final UUID CHAR_STATUS_UUID = UUID.fromString("1fa89f02-34b2-4d7a-b9c2-75d82084c7e1");
    public static final UUID CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static final String API_QR_URL = "https://ifs360-sg.com/api/qr";

    private static volatile BleDoorAccessManager instance;

    private Context context;
    private BluetoothManager bluetoothManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothGattServer gattServer;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothGattCharacteristic statusCharacteristic;

    private String deviceSerialNumber = "";
    private DoorUnlockCallback unlockCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean isRunning = false;

    public interface DoorUnlockCallback {
        void onDoorUnlock(long autoCloseDelayMs);
    }

    private BleDoorAccessManager() {}

    public static BleDoorAccessManager getInstance() {
        if (instance == null) {
            synchronized (BleDoorAccessManager.class) {
                if (instance == null) {
                    instance = new BleDoorAccessManager();
                }
            }
        }
        return instance;
    }

    @SuppressLint("MissingPermission")
    public void init(Context ctx, String serialNumber, DoorUnlockCallback callback) {
        if (isRunning) {
            Log.d(TAG, "BLE Door Access Manager is already running.");
            return;
        }

        this.context = ctx.getApplicationContext();
        this.deviceSerialNumber = serialNumber != null ? serialNumber.trim() : "";
        this.unlockCallback = callback;

        bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager == null) {
            Log.e(TAG, "BluetoothManager not available on this device.");
            return;
        }

        bluetoothAdapter = bluetoothManager.getAdapter();
        if (bluetoothAdapter == null) {
            Log.e(TAG, "BluetoothAdapter not available on this device.");
            return;
        }

        if (!bluetoothAdapter.isEnabled()) {
            try {
                bluetoothAdapter.enable();
                Log.d(TAG, "Enabling Bluetooth adapter...");
            } catch (Exception e) {
                Log.e(TAG, "Failed to enable Bluetooth: " + e.getMessage());
            }
        }

        // Set BLE friendly name with device serial for easy mobile app identification
        try {
            String bleName = "IFS_" + (deviceSerialNumber.length() > 10 ? deviceSerialNumber.substring(deviceSerialNumber.length() - 10) : deviceSerialNumber);
            bluetoothAdapter.setName(bleName);
        } catch (Exception e) {
            Log.w(TAG, "Could not set Bluetooth adapter name: " + e.getMessage());
        }

        startGattServer();
        startAdvertising();
        isRunning = true;
        Log.i(TAG, "BLE Door Access Manager initialized for serial: " + deviceSerialNumber);
    }

    @SuppressLint("MissingPermission")
    private void startGattServer() {
        try {
            gattServer = bluetoothManager.openGattServer(context, gattServerCallback);
            if (gattServer == null) {
                Log.e(TAG, "Unable to open GATT server.");
                return;
            }

            BluetoothGattService service = new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);

            // Unlock Characteristic (Phone writes unlock token here)
            BluetoothGattCharacteristic unlockCharacteristic = new BluetoothGattCharacteristic(
                    CHAR_UNLOCK_UUID,
                    BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE | BluetoothGattCharacteristic.PROPERTY_READ,
                    BluetoothGattCharacteristic.PERMISSION_WRITE | BluetoothGattCharacteristic.PERMISSION_READ
            );

            // Status Characteristic (Intercom notifies phone of unlock result)
            statusCharacteristic = new BluetoothGattCharacteristic(
                    CHAR_STATUS_UUID,
                    BluetoothGattCharacteristic.PROPERTY_READ | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                    BluetoothGattCharacteristic.PERMISSION_READ
            );

            BluetoothGattDescriptor cccd = new BluetoothGattDescriptor(
                    CCCD_UUID,
                    BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE
            );
            statusCharacteristic.addDescriptor(cccd);

            service.addCharacteristic(unlockCharacteristic);
            service.addCharacteristic(statusCharacteristic);

            gattServer.addService(service);
            Log.i(TAG, "GATT Server started with Service UUID: " + SERVICE_UUID);
        } catch (Exception e) {
            Log.e(TAG, "Failed to setup GATT server: " + e.getMessage(), e);
        }
    }

    @SuppressLint("MissingPermission")
    private void startAdvertising() {
        advertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            Log.w(TAG, "BLE Advertising not supported on this chipset (advertiser is null). GATT Server remains active.");
            return;
        }

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setConnectable(true)
                .setTimeout(0)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .build();

        // Primary Advertisement (must be <= 31 bytes)
        // 16 bytes UUID + 2 bytes header = 18 bytes.
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceUuid(new ParcelUuid(SERVICE_UUID))
                .build();

        // Scan response contains only device name (under 20 bytes, safely <= 31 bytes)
        AdvertiseData scanResponse = new AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .build();

        try {
            advertiser.startAdvertising(settings, data, scanResponse, advertiseCallback);
            Log.i(TAG, "BLE Advertising started for IFS360 Door Service.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start BLE advertising: " + e.getMessage(), e);
        }
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            Log.i(TAG, ">>> [BLE-ADV-SUCCESS] BLE Advertising started successfully!");
        }

        @Override
        public void onStartFailure(int errorCode) {
            String errorName = "UNKNOWN (" + errorCode + ")";
            switch (errorCode) {
                case ADVERTISE_FAILED_DATA_TOO_LARGE:
                    errorName = "ADVERTISE_FAILED_DATA_TOO_LARGE (1)";
                    break;
                case ADVERTISE_FAILED_TOO_MANY_ADVERTISERS:
                    errorName = "ADVERTISE_FAILED_TOO_MANY_ADVERTISERS (2)";
                    break;
                case ADVERTISE_FAILED_ALREADY_STARTED:
                    errorName = "ADVERTISE_FAILED_ALREADY_STARTED (3)";
                    break;
                case ADVERTISE_FAILED_INTERNAL_ERROR:
                    errorName = "ADVERTISE_FAILED_INTERNAL_ERROR (4)";
                    break;
                case ADVERTISE_FAILED_FEATURE_UNSUPPORTED:
                    errorName = "ADVERTISE_FAILED_FEATURE_UNSUPPORTED (5)";
                    break;
            }
            Log.e(TAG, ">>> [BLE-ADV-FAIL] BLE Advertising failed: " + errorName);

            if (errorCode == ADVERTISE_FAILED_DATA_TOO_LARGE && advertiser != null) {
                try {
                    AdvertiseSettings minimalSettings = new AdvertiseSettings.Builder()
                            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                            .setConnectable(true)
                            .setTimeout(0)
                            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                            .build();

                    AdvertiseData minimalData = new AdvertiseData.Builder()
                            .setIncludeDeviceName(false)
                            .addServiceUuid(new ParcelUuid(SERVICE_UUID))
                            .build();

                    advertiser.startAdvertising(minimalSettings, minimalData, null, new AdvertiseCallback() {
                        @Override
                        public void onStartSuccess(AdvertiseSettings s) {
                            Log.i(TAG, ">>> [BLE-ADV-SUCCESS] Fallback minimal advertising started successfully!");
                        }
                        @Override
                        public void onStartFailure(int err) {
                            Log.e(TAG, ">>> [BLE-ADV-FAIL] Fallback advertising failed: " + err);
                        }
                    });
                } catch (Exception e) {
                    Log.e(TAG, "Fallback advertising exception: " + e.getMessage());
                }
            }
        }
    };

    private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {
        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
            super.onConnectionStateChange(device, status, newState);
            Log.d(TAG, "GATT connection state change: device=" + device.getAddress() + ", status=" + status + ", newState=" + newState);
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                                                 BluetoothGattCharacteristic characteristic,
                                                 boolean preparedWrite, boolean responseNeeded,
                                                 int offset, byte[] value) {
            super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value);

            if (responseNeeded) {
                gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
            }

            if (CHAR_UNLOCK_UUID.equals(characteristic.getUuid())) {
                if (value == null || value.length == 0) {
                    Log.w(TAG, "Received empty write request on unlock characteristic.");
                    return;
                }

                String payload = new String(value, StandardCharsets.UTF_8).trim();
                Log.d(TAG, "Received BLE write payload: " + payload);

                // Parse token: payload could be raw token string "15/42/ABC..." or JSON {"token":"15/42/ABC..."}
                String token = payload;
                try {
                    if (payload.startsWith("{")) {
                        JSONObject json = new JSONObject(payload);
                        if (json.has("token")) {
                            token = json.getString("token");
                        } else if (json.has("qr_code")) {
                            token = json.getString("qr_code");
                        }
                    }
                } catch (Exception ignored) {}

                verifyAndUnlock(device, token);
            }
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onDescriptorWriteRequest(BluetoothDevice device, int requestId,
                                             BluetoothGattDescriptor descriptor,
                                             boolean preparedWrite, boolean responseNeeded,
                                             int offset, byte[] value) {
            super.onDescriptorWriteRequest(device, requestId, descriptor, preparedWrite, responseNeeded, offset, value);
            if (responseNeeded) {
                gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
            }
        }
    };

    /**
     * Verifies the token with the Odoo backend via /api/qr with access_type=bluetooth.
     */
    private void verifyAndUnlock(BluetoothDevice device, String token) {
        new Thread(() -> {
            Log.i(TAG, "Verifying BLE unlock token with backend: " + token + " for serial: " + deviceSerialNumber);
            try {
                URL url = new URL(API_QR_URL);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setDoOutput(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);

                String jsonInput = "{"
                        + "\"jsonrpc\": \"2.0\","
                        + "\"params\": {"
                        + "\"qr_code\": \"" + token + "\","
                        + "\"serial_number\": \"" + deviceSerialNumber + "\","
                        + "\"access_type\": \"bluetooth\""
                        + "}"
                        + "}";

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonInput.getBytes(StandardCharsets.UTF_8));
                }

                int responseCode = conn.getResponseCode();
                InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
                StringBuilder sb = new StringBuilder();
                if (is != null) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                    String line;
                    while ((line = br.readLine()) != null) {
                        sb.append(line);
                    }
                }
                String responseText = sb.toString();
                Log.d(TAG, "Backend verification response: " + responseText);

                boolean unlockSuccess = false;
                long delayMs = 8000L;
                String message = "Access Denied";

                if (responseCode == HttpURLConnection.HTTP_OK) {
                    JSONObject root = new JSONObject(responseText);
                    JSONObject result = root.optJSONObject("result");
                    if (result != null && result.optBoolean("open_door", false)) {
                        unlockSuccess = true;
                        int closingSecs = result.optInt("seconds_closing_door", 8);
                        delayMs = closingSecs > 0 ? (closingSecs * 1000L) : 8000L;
                        message = "Door Unlocked Successfully";
                    } else if (result != null && result.has("message")) {
                        message = result.optString("message", "Access Denied");
                    }
                }

                final boolean finalSuccess = unlockSuccess;
                final long finalDelay = delayMs;
                final String finalMsg = message;

                mainHandler.post(() -> {
                    if (finalSuccess && unlockCallback != null) {
                        Log.i(TAG, "BLE Token valid. Triggering hardware door unlock with delay: " + finalDelay + "ms");
                        unlockCallback.onDoorUnlock(finalDelay);
                    }
                    notifyDeviceStatus(device, finalSuccess ? 200 : 403, finalMsg);
                });

            } catch (Exception e) {
                Log.e(TAG, "Error verifying BLE token with backend: " + e.getMessage(), e);
                mainHandler.post(() -> notifyDeviceStatus(device, 500, "Server connection error"));
            }
        }).start();
    }

    @SuppressLint("MissingPermission")
    private void notifyDeviceStatus(BluetoothDevice device, int statusCode, String message) {
        if (gattServer == null || statusCharacteristic == null || device == null) return;
        try {
            String notifyPayload = "{\"status\":" + statusCode + ",\"message\":\"" + message + "\"}";
            statusCharacteristic.setValue(notifyPayload.getBytes(StandardCharsets.UTF_8));
            gattServer.notifyCharacteristicChanged(device, statusCharacteristic, false);
            Log.d(TAG, "Sent BLE notification to device: " + notifyPayload);
        } catch (Exception e) {
            Log.w(TAG, "Failed to send BLE notification: " + e.getMessage());
        }
    }

    @SuppressLint("MissingPermission")
    public void stop() {
        isRunning = false;
        try {
            if (advertiser != null) {
                advertiser.stopAdvertising(advertiseCallback);
                advertiser = null;
            }
        } catch (Exception ignored) {}

        try {
            if (gattServer != null) {
                gattServer.close();
                gattServer = null;
            }
        } catch (Exception ignored) {}
        Log.i(TAG, "BLE Door Access Manager stopped.");
    }
}
