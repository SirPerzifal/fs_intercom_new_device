package io.ionic.starter;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.RemoteException;
import android.text.TextUtils;
import android.util.Log;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;
import com.dk.usbNfc.DeviceManager.UsbNfcDevice;
import com.dk.usbNfc.DeviceManager.DeviceManagerCallback;
import com.dk.usbNfc.Tool.StringTool;

import android.app.smdt.SmdtManagerNew;
import io.ionic.starter.plugin.IntercomPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    // Core SDK & Plugins
    private SmdtManagerNew smdt;
    private static UsbNfcDevice usbNfcDevice;
    private io.ionic.starter.plugin.IntercomPlugin plugin;

    public void setPlugin(io.ionic.starter.plugin.IntercomPlugin plugin) {
        this.plugin = plugin;
    }

    // Timing & Cooldown
    private long lastCardSendTime = 0;
    private long lastQrSendTime = 0;
    private long lastSuccessfulQrScanTime = 0;
    private static final long QR_SCAN_COOLDOWN_MS = 1000;

    // QR Code Serial Config (/dev/ttyS7, 115200 baud)
    private static final String QR_UART_PORT = "/dev/ttyS7";
    private static final int QR_BAUD_RATE = 115200;
    private final ByteArrayOutputStream qrStreamBuffer = new ByteArrayOutputStream();
    private final Handler qrPacketHandler = new Handler(Looper.getMainLooper());

    // USB HID Keyboard Buffer (Fallback jika Card Reader tipe USB Keyboard)
    private final StringBuilder keyInputBuffer = new StringBuilder();
    private final Handler keyInputHandler = new Handler(Looper.getMainLooper());

    // =========================================================================
    // ⚙️ LIFECYCLE METHOD (onCreate, onResume, onPause, onDestroy)
    // =========================================================================

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.e(TAG, "onCreate MainActivity");
        registerPlugin(IntercomPlugin.class);
        super.onCreate(savedInstanceState);

        // Inisialisasi SDK SMDT Hardware
        DMAccessUtil.getInstance().init(this);
        smdt = SmdtManagerNew.getInstance(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                if (smdt != null) {
                    smdt.dev_setUsbPower(1, 1, true);
                    smdt.dev_setUsbPower(2, 1, true);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error set USB Power: " + e.getMessage());
            }
            setupQrCodeScanner();
            setupDerkUsbCardReader();
            setupWiegandCardReader();
        }, 1000);
    }

    @Override
    public void onPause() {
        super.onPause();
        if (smdt != null) {
            try {
                smdt.custom_releaseWiegandRead();
                smdt.dev_closeUart(QR_UART_PORT);
            } catch (Exception e) {
                Log.e(TAG, "Error on pause: " + e.getMessage());
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (smdt != null) {
            try {
                smdt.custom_releaseWiegandRead();
                smdt.dev_closeUart(QR_UART_PORT);
            } catch (Exception e) {
                Log.e(TAG, "Error on destroy: " + e.getMessage());
            }
        }
    }

    // =========================================================================
    // 📷 QR CODE SCANNER (/dev/ttyS7)
    // =========================================================================

    private void setupQrCodeScanner() {
        if (smdt == null)
            return;
        try {
            int result = smdt.dev_openUart(QR_UART_PORT, QR_BAUD_RATE, 8, 1, 0, 0);
            if (result == 0) {
                receiveQrUart();
            } else {
                Log.e(TAG, "Gagal buka port QR: " + QR_UART_PORT + " (code: " + result + ")");
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception setup QR: " + e.getMessage());
        }
    }

    private void receiveQrUart() {
        try {
            smdt.dev_receiveUart(QR_UART_PORT, new SmdtManagerNew.DataCallback() {
                @Override
                public void onDataReceive(byte[] buffer, int size) throws RemoteException {
                    if (buffer == null || size <= 0)
                        return;

                    long now = System.currentTimeMillis();
                    if (now - lastSuccessfulQrScanTime < QR_SCAN_COOLDOWN_MS)
                        return;

                    boolean hasNewline = false;
                    for (int i = 0; i < size; i++) {
                        if (buffer[i] == 0x0D || buffer[i] == 0x0A) {
                            hasNewline = true;
                            break;
                        }
                    }

                    synchronized (qrStreamBuffer) {
                        qrStreamBuffer.write(buffer, 0, size);
                    }

                    qrPacketHandler.removeCallbacks(qrProcessPacketRunnable);
                    qrPacketHandler.postDelayed(qrProcessPacketRunnable, hasNewline ? 30 : 150);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Exception receiveQrUart: " + e.getMessage());
        }
    }

    private final Runnable qrProcessPacketRunnable = new Runnable() {
        @Override
        public void run() {
            byte[] fullBytes;
            synchronized (qrStreamBuffer) {
                if (qrStreamBuffer.size() == 0)
                    return;
                fullBytes = qrStreamBuffer.toByteArray();
                qrStreamBuffer.reset();
            }

            lastSuccessfulQrScanTime = System.currentTimeMillis();
            String qrText = decodeCleanString(fullBytes, fullBytes.length);
            if (TextUtils.isEmpty(qrText)) {
                qrText = bytesToHex(fullBytes, fullBytes.length);
            }

            final String finalResult = qrText;
            runOnUiThread(
                    () -> Toast.makeText(MainActivity.this, "[TEST] QR Code: " + finalResult, Toast.LENGTH_SHORT)
                            .show());

            long now = System.currentTimeMillis();
            if (now - lastQrSendTime > 3000) {
                lastQrSendTime = now;
                sendQrCodeToBackend(finalResult);
            }
        }
    };

    // =========================================================================
    // 💳 DERK USB CARD READER (DKCloudID SDK - Perangkat Utam)
    // =========================================================================

    private void setupDerkUsbCardReader() {
        try {
            if (usbNfcDevice != null) {
                try {
                    usbNfcDevice.destroy();
                } catch (Exception ignored) {
                }
                usbNfcDevice = null;
            }
            usbNfcDevice = new UsbNfcDevice(MainActivity.this);
            usbNfcDevice.setCallBack(deviceManagerCallback);
            Log.e(TAG, "DERK USB Card Reader setup berhasil dipasang!");
        } catch (Exception e) {
            Log.e(TAG, "Exception setup DERK USB Card Reader: " + e.getMessage());
        }
    }

    private final DeviceManagerCallback deviceManagerCallback = new DeviceManagerCallback() {
        @Override
        public void onReceiveRfnSearchCard(boolean blnIsSus, int cardType, byte[] bytCardSn, byte[] bytCarATS) {
            super.onReceiveRfnSearchCard(blnIsSus, cardType, bytCardSn, bytCarATS);
            if (!blnIsSus || cardType == UsbNfcDevice.CARD_TYPE_NO_DEFINE)
                return;

            String cardUid = StringTool.byteHexToSting(bytCardSn);
            Log.e(TAG, ">>> [DERK USB CARD TAP] UID: " + cardUid);

            runOnUiThread(
                    () -> Toast.makeText(MainActivity.this, "[TEST] Card: " + cardUid, Toast.LENGTH_SHORT).show());

            long now = System.currentTimeMillis();
            if (now - lastCardSendTime > 3000) {
                lastCardSendTime = now;
                sendCardToBackend(cardUid);
            }
        }
    };

    // =========================================================================
    // 💳 WIEGAND CARD READER & USB KEYBOARD FALLBACK
    // =========================================================================

    private void setupWiegandCardReader() {
        if (smdt == null)
            return;
        try {
            smdt.custom_releaseWiegandRead();
            smdt.custom_readWiegandData(new SmdtManagerNew.WiegandCallback() {
                @Override
                public void onReadData(String data) throws RemoteException {
                    if (TextUtils.isEmpty(data))
                        return;
                    Log.e(TAG, "Kartu Wiegand: " + data);
                    runOnUiThread(() -> Toast
                            .makeText(MainActivity.this, "[TEST] Wiegand Card: " + data, Toast.LENGTH_SHORT).show());

                    long now = System.currentTimeMillis();
                    if (now - lastCardSendTime > 3000) {
                        lastCardSendTime = now;
                        sendCardToBackend(data);
                    }
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Exception setup Wiegand: " + e.getMessage());
        }
    }

    @Override
    public boolean dispatchKeyEvent(android.view.KeyEvent event) {
        if (event.getAction() == android.view.KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            char c = (char) event.getUnicodeChar();

            if (keyCode == android.view.KeyEvent.KEYCODE_ENTER
                    || keyCode == android.view.KeyEvent.KEYCODE_NUMPAD_ENTER) {
                keyInputHandler.removeCallbacks(processKeyInputRunnable);
                keyInputHandler.post(processKeyInputRunnable);
                return true;
            } else if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
                synchronized (keyInputBuffer) {
                    keyInputBuffer.append(c);
                }
                keyInputHandler.removeCallbacks(processKeyInputRunnable);
                keyInputHandler.postDelayed(processKeyInputRunnable, 300);
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private final Runnable processKeyInputRunnable = new Runnable() {
        @Override
        public void run() {
            String cardData;
            synchronized (keyInputBuffer) {
                if (keyInputBuffer.length() == 0)
                    return;
                cardData = keyInputBuffer.toString().trim();
                keyInputBuffer.setLength(0);
            }
            if (!TextUtils.isEmpty(cardData)) {
                Log.e(TAG, ">>> [USB HID CARD TAP] Data: " + cardData);
                runOnUiThread(
                        () -> Toast.makeText(MainActivity.this, "USB Card: " + cardData, Toast.LENGTH_SHORT).show());
                long now = System.currentTimeMillis();
                if (now - lastCardSendTime > 3000) {
                    lastCardSendTime = now;
                    sendCardToBackend(cardData);
                }
            }
        }
    };

    // =========================================================================
    // 🌐 API BACKEND CALLS (QR & CARD)
    // =========================================================================

    private void sendQrCodeToBackend(String qrCode) {
        new Thread(() -> {
            try {
                URL url = new URL("https://ifs360-sg.com/api/qr");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                String jsonInput = "{"
                        + "\"jsonrpc\": \"2.0\","
                        + "\"params\": {"
                        + "\"qr_code\": \"" + qrCode + "\","
                        + "\"serial_number\": \"" + getDeviceSerial() + "\""
                        + "}"
                        + "}";

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonInput.getBytes("utf-8"));
                }

                if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "utf-8"));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null)
                        sb.append(line);

                    JSONObject root = new JSONObject(sb.toString());
                    JSONObject result = root.optJSONObject("result");
                    String errorMessage = result != null ? result.optString("message", "") : "";
                    if (result != null && result.optBoolean("open_door", false)) {
                        plugin.sendToastMessage("Successfully open the door", true);
                        long delay = result.optLong("seconds_closing_door", 5) * 1000L;
                        triggerOpenDoor(delay);
                    } else {
                        if (errorMessage != "") {
                            plugin.sendToastMessage(errorMessage, false);
                        } else {
                            plugin.sendToastMessage("Failed to open the door", false);
                        }
                        temporaryRedLed();
                    }
                    Log.e(TAG, "Proses backend QR selesai. Response: " + sb.toString());
                } else {
                    temporaryRedLed();
                    plugin.sendToastMessage("Failed to open the door", false);
                    Log.e(TAG, "Proses backend QR gagal, HTTP code: " + conn.getResponseCode());
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Error kirim QR ke backend: " + e.getMessage());
                plugin.sendToastMessage("Failed to open the door", false);
                temporaryRedLed();
            }
        }).start();
    }

    private void sendCardToBackend(String cardNum) {
        new Thread(() -> {
            try {
                URL url = new URL("https://ifs360-sg.com/api/card");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                String jsonInput = "{"
                        + "\"jsonrpc\": \"2.0\","
                        + "\"params\": {"
                        + "\"card_num\": \"" + cardNum + "\","
                        + "\"serial_number\": \"" + getDeviceSerial() + "\""
                        + "}"
                        + "}";

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonInput.getBytes("utf-8"));
                }

                if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "utf-8"));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null)
                        sb.append(line);

                    JSONObject root = new JSONObject(sb.toString());
                    JSONObject result = root.optJSONObject("result");
                    String errorMessage = result != null ? result.optString("message", "") : "";

                    if (result != null && result.optBoolean("open_door", false)) {
                        plugin.sendToastMessage("Successfully open the door", true);
                        long delay = result.optLong("seconds_closing_door", 5) * 1000L;
                        triggerOpenDoor(delay);
                    } else {
                        if (errorMessage != "") {
                            plugin.sendToastMessage(errorMessage, false);
                        } else {
                            plugin.sendToastMessage("Failed to open the door", false);
                        }
                        temporaryRedLed();
                    }
                    Log.e(TAG, "Proses backend Card selesai. Response: " + sb.toString());
                } else {
                    temporaryRedLed();
                    Log.e(TAG, "Proses backend Card gagal, HTTP code: " + conn.getResponseCode());
                    plugin.sendToastMessage("Failed to open the door", false);
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Error kirim Kartu ke backend: " + e.getMessage());
                plugin.sendToastMessage("Failed to open the door", false);
                temporaryRedLed();
            }
        }).start();
    }

    // =========================================================================
    // 🚪 HELPER HARDWARE (Buka Pintu & Kontrol LED)
    // =========================================================================

    private void triggerOpenDoor(long autoCloseDelayMs) {
        new Handler(Looper.getMainLooper()).post(() -> {
            DMAccessUtil.getInstance().openDoor();
            DMAccessUtil.getInstance().closeRedLed();
            DMAccessUtil.getInstance().closeWhiteLed();
            DMAccessUtil.getInstance().openGreenLed();

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeDoor();
                DMAccessUtil.getInstance().closeAllLed();
            }, autoCloseDelayMs);
        });
    }

    private void temporaryRedLed() {
        new Handler(Looper.getMainLooper()).post(() -> {
            DMAccessUtil.getInstance().openRedLed();
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeRedLed();
            }, 1000);
        });
    }

    private String getDeviceSerial() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try {
                return android.os.Build.getSerial();
            } catch (SecurityException e) {
                return android.os.Build.SERIAL;
            }
        } else {
            return android.os.Build.SERIAL;
        }
    }

    // Helper Utility Strings
    private static String bytesToHex(byte[] bytes, int length) {
        if (bytes == null || length <= 0)
            return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < length && i < bytes.length; i++) {
            sb.append(String.format("%02X ", bytes[i]));
        }
        return sb.toString().trim();
    }

    private static String decodeCleanString(byte[] buffer, int size) {
        if (buffer == null || size <= 0)
            return "";
        try {
            String str = new String(buffer, 0, size, java.nio.charset.StandardCharsets.UTF_8);
            String cleaned = str.replaceAll("[\\x00-\\x1F\\x7F-\\x9F]", "").trim();
            if (!cleaned.isEmpty() && !cleaned.contains("\uFFFD"))
                return cleaned;

            String gbkStr = new String(buffer, 0, size, java.nio.charset.Charset.forName("GBK"));
            String gbkCleaned = gbkStr.replaceAll("[\\x00-\\x1F\\x7F-\\x9F]", "").trim();
            if (!gbkCleaned.isEmpty() && !gbkCleaned.contains("\uFFFD"))
                return gbkCleaned;

            return cleaned.isEmpty() ? gbkCleaned : cleaned;
        } catch (Exception e) {
            return "";
        }
    }
}
