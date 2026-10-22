package io.ionic.starter;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.RemoteException;
import android.text.TextUtils;
import android.util.Log;
import android.widget.Toast;
import android.content.Context;
import android.content.Intent;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.os.Build;

import com.getcapacitor.BridgeActivity;
import com.dk.usbNfc.DeviceManager.UsbNfcDevice;
import com.dk.usbNfc.DeviceManager.DeviceManagerCallback;
import com.dk.usbNfc.Tool.StringTool;

import android.app.smdt.SmdtManagerNew;
import io.ionic.starter.plugin.IntercomPlugin;
import io.ionic.starter.plugin.RingtonePlugin;
import io.ionic.starter.plugin.ActivityLauncher;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
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

    // =========================================================================
    // ⚙️ LIFECYCLE METHOD (onCreate, onResume, onPause, onDestroy)
    // =========================================================================

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.e(TAG, "onCreate MainActivity");
        registerPlugin(IntercomPlugin.class);
        registerPlugin(RingtonePlugin.class);
        registerPlugin(ActivityLauncher.class);
        super.onCreate(savedInstanceState);

        // Inisialisasi SDK SMDT Hardware
        DMAccessUtil.getInstance().init(this);
        smdt = SmdtManagerNew.getInstance(this);

        checkAndRequestFacePermissions();
        startLogcatLogging();

        // 🚀 Pre-initialize Megvii FacePass SDK saat Intercom menyala/booting
        io.ionic.starter.facepass.InitFacePassHandler.init(this, handler -> {
            if (handler != null) {
                Log.d(TAG, ">>> [BOOT-INIT-SUCCESS] Megvii FacePass SDK pre-initialized successfully on app launch!");
            } else {
                Log.e(TAG, ">>> [BOOT-INIT-FAIL] Megvii FacePass SDK pre-initialization failed on app launch.");
            }
        });

        // Initialize Bluetooth BLE Door Access Manager
        try {
            String deviceSerial = getDeviceSerial();
            io.ionic.starter.ble.BleDoorAccessManager.getInstance().init(this, deviceSerial, autoCloseDelayMs -> {
                Log.d(TAG, "BLE unlock triggered, opening door via triggerOpenDoor");
                triggerOpenDoor(autoCloseDelayMs);
            });
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize BleDoorAccessManager: " + e.getMessage(), e);
        }

        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            android.view.View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(
                    android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    private void startLogcatLogging() {
        new Thread(() -> {
            try {
                // Clear logcat buffer terlebih dahulu
                Runtime.getRuntime().exec("logcat -c");

                // Merekam logcat khusus tag penting ke /sdcard/log_intercom.txt
                String logCommand = "logcat -v time -f /sdcard/log_intercom.txt -r 51200 -n 3 " +
                        "FacePassHelper:V InitFacePassHandler:V MainActivity:V IntercomPlugin:V " +
                        "FloatingCameraOverlay:V MegviiFacepass:V SmdtManagerNew:V DMAccessUtil:V *:S";

                Runtime.getRuntime().exec(logCommand);
                Log.d(TAG, "[LOGCAT-INIT] Automated logcat recording started to /sdcard/log_intercom.txt");
            } catch (Exception e) {
                Log.e(TAG, "[LOGCAT-ERROR] Failed to start logcat recording: " + e.getMessage(), e);
            }
        }).start();
    }

    private void checkAndRequestFacePermissions() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            String[] permissions = new String[] {
                    android.Manifest.permission.CAMERA,
                    android.Manifest.permission.READ_PHONE_STATE,
                    android.Manifest.permission.READ_EXTERNAL_STORAGE,
                    android.Manifest.permission.WRITE_EXTERNAL_STORAGE
            };
            boolean needRequest = false;
            for (String p : permissions) {
                if (checkSelfPermission(p) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    needRequest = true;
                    break;
                }
            }
            if (needRequest) {
                requestPermissions(permissions, 1001);
            }
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            if (!android.os.Environment.isExternalStorageManager()) {
                try {
                    android.content.Intent intent = new android.content.Intent(
                            android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.addCategory("android.intent.category.DEFAULT");
                    intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception ignored) {
                }
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Turn USB power ON immediately when activity resumes
        try {
            if (smdt != null) {
                smdt.dev_setUsbPower(1, 1, true);
                smdt.dev_setUsbPower(2, 1, true);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error set USB Power: " + e.getMessage());
        }

        Handler handler = new Handler(Looper.getMainLooper());

        // Fast setup for UART QR & Wiegand (1000ms)
        handler.postDelayed(() -> {
            setupQrCodeScanner();
            setupWiegandCardReader();
        }, 1000);

        // Staggered setup for DERK USB Card Reader (2500ms) to allow USB bus
        // enumeration on cold boot
        handler.postDelayed(() -> {
            setupDerkUsbCardReader();
        }, 2500);

        // Fallback safety retry for DERK USB Card Reader at 5000ms on cold boot
        handler.postDelayed(() -> {
            setupDerkUsbCardReader();
        }, 5000);
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
        try {
            io.ionic.starter.ble.BleDoorAccessManager.getInstance().stop();
        } catch (Exception ignored) {}
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

    public boolean setupQrCodeScanner() {
        return reinitializeQrScanner();
    }

    public boolean reinitializeQrScanner() {
        if (smdt == null) {
            smdt = SmdtManagerNew.getInstance(this);
        }
        if (smdt == null) {
            Log.e(TAG, "[QR-INIT] SmdtManagerNew instance is null!");
            return false;
        }
        try {
            // Power on USB ports in case module is powered through USB bus
            try {
                smdt.dev_setUsbPower(1, 1, true);
                smdt.dev_setUsbPower(2, 1, true);
            } catch (Exception ignored) {
            }

            // Close any existing open UART handle before opening
            try {
                smdt.dev_closeUart(QR_UART_PORT);
            } catch (Exception ignored) {
            }

            // Reset stream buffer
            synchronized (qrStreamBuffer) {
                qrStreamBuffer.reset();
            }

            int result = smdt.dev_openUart(QR_UART_PORT, QR_BAUD_RATE, 8, 1, 0, 0);
            if (result == 0) {
                receiveQrUart();
                Log.d(TAG, "[QR-INIT] QR Code Scanner (" + QR_UART_PORT + ") setup successfully installed.");
                return true;
            } else {
                Log.e(TAG, "Gagal buka port QR: " + QR_UART_PORT + " (code: " + result + ")");
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception setup QR: " + e.getMessage());
            return false;
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
            Log.e(TAG, ">>> [QR-SCANNER] Scanned Code: " + finalResult);
            // runOnUiThread(() -> Toast.makeText(MainActivity.this, "[TEST] QR Code: " + finalResult, Toast.LENGTH_SHORT).show());

            long now = System.currentTimeMillis();
            if (now - lastQrSendTime > 3000) {
                lastQrSendTime = now;
                sendQrCodeToBackend(finalResult);
            }
        }
    };

    // =========================================================================
    // 💳 UNIFIED CARD READER PROCESSOR & LOGGING
    // =========================================================================

    private void onCardScanned(String cardUid, String sourceTag) {
        if (TextUtils.isEmpty(cardUid))
            return;

        Log.e(TAG, ">>> [CARD-SCANNER] Source: " + sourceTag + " | Card UID: " + cardUid);
        // runOnUiThread(() -> Toast.makeText(MainActivity.this, "[CARD] (" + sourceTag + ") UID: " + cardUid, Toast.LENGTH_SHORT).show());

        long now = System.currentTimeMillis();
        if (now - lastCardSendTime > 3000) {
            lastCardSendTime = now;
            Log.d(TAG, ">>> [CARD-SCANNER] Dispatching Card UID " + cardUid + " to backend...");
            sendCardToBackend(cardUid);
        } else {
            Log.d(TAG, ">>> [CARD-SCANNER] Card UID ignored (3s cooldown active)");
        }
    }

    public boolean reinitializeCardReader() {
        if (smdt == null) {
            smdt = SmdtManagerNew.getInstance(this);
        }
        try {
            if (smdt != null) {
                try {
                    smdt.dev_setUsbPower(1, 1, true);
                    smdt.dev_setUsbPower(2, 1, true);
                } catch (Exception ignored) {
                }
            }

            setupDerkUsbCardReader();
            setupWiegandCardReader();
            Log.d(TAG, "[CARD-REINIT] Card readers (DERK USB & Wiegand) reinitialized successfully.");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "[CARD-REINIT] Exception reinitializing card readers: " + e.getMessage(), e);
            return false;
        }
    }

    public void setupDerkUsbCardReader() {
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
            Log.d(TAG, "[CARD-INIT] DERK USB Card Reader setup successfully installed.");
        } catch (Exception e) {
            Log.e(TAG, "[CARD-INIT-ERROR] Exception setting up DERK USB Card Reader: " + e.getMessage(), e);
        }
    }

    private final DeviceManagerCallback deviceManagerCallback = new DeviceManagerCallback() {
        @Override
        public void onReceiveRfnSearchCard(boolean blnIsSus, int cardType, byte[] bytCardSn, byte[] bytCarATS) {
            super.onReceiveRfnSearchCard(blnIsSus, cardType, bytCardSn, bytCarATS);
            if (!blnIsSus || cardType == UsbNfcDevice.CARD_TYPE_NO_DEFINE)
                return;

            String cardUid = StringTool.byteHexToSting(bytCardSn);
            onCardScanned(cardUid, "DERK USB");
        }
    };

    public void setupWiegandCardReader() {
        if (smdt == null)
            return;
        try {
            smdt.custom_releaseWiegandRead();
            smdt.custom_readWiegandData(new SmdtManagerNew.WiegandCallback() {
                @Override
                public void onReadData(String data) throws RemoteException {
                    if (TextUtils.isEmpty(data))
                        return;
                    onCardScanned(data, "WIEGAND");
                }
            });
            Log.d(TAG, "[CARD-INIT] Wiegand Card Reader setup successfully installed.");
        } catch (Exception e) {
            Log.e(TAG, "[CARD-INIT-ERROR] Exception setting up Wiegand: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // 💳 USB HID KEYBOARD CARD READER (dispatchKeyEvent)
    // =========================================================================

    private final StringBuilder keyInputBuffer = new StringBuilder();
    private final Handler keyInputHandler = new Handler(Looper.getMainLooper());

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
                onCardScanned(cardData, "USB HID");
            }
        }
    };

    // =========================================================================
    // 🌐 API BACKEND CALLS (QR & CARD)
    // =========================================================================

    private void sendQrCodeToBackend(String qrCode) {
        new Thread(() -> {
            String targetUrl = "https://ifs360-sg.com/api/qr";
            String deviceSerial = getDeviceSerial();
            Log.e(TAG, ">>> [QR-REQUEST] URL: " + targetUrl + " | Params: qr_code=" + qrCode + ", serial_number=" + deviceSerial);
            try {
                URL url = new URL(targetUrl);
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
                        + "\"serial_number\": \"" + deviceSerial + "\""
                        + "}"
                        + "}";

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonInput.getBytes("utf-8"));
                }

                int responseCode = conn.getResponseCode();
                InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
                String responseText = "";
                if (is != null) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(is, "utf-8"));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null)
                        sb.append(line);
                    responseText = sb.toString();
                }

                if (responseCode == HttpURLConnection.HTTP_OK) {
                    JSONObject root = new JSONObject(responseText);
                    JSONObject result = root.optJSONObject("result");
                    String errorMessage = result != null ? result.optString("message", "") : "";
                    if (result != null && result.optBoolean("open_door", false)) {
                        if (plugin != null) plugin.sendToastMessage("Successfully open the door", true);
                        long delay = result.optLong("seconds_closing_door", 5) * 1000L;
                        triggerOpenDoor(delay);
                    } else {
                        if (errorMessage != "") {
                            if (plugin != null) plugin.sendToastMessage(errorMessage, false);
                        } else {
                            if (plugin != null) plugin.sendToastMessage("Failed to open the door", false);
                        }
                        temporaryRedLed();
                    }
                    Log.e(TAG, ">>> [QR-RESPONSE-SUCCESS] Response: " + responseText);
                } else {
                    temporaryRedLed();
                    if (plugin != null) plugin.sendToastMessage("Failed to open the door", false);
                    Log.e(TAG, ">>> [QR-RESPONSE-FAIL] HTTP Code: " + responseCode + " | Response: " + responseText);
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, ">>> [QR-RESPONSE-ERROR] Exception: " + e.getMessage());
                if (plugin != null) plugin.sendToastMessage("Failed to open the door", false);
                temporaryRedLed();
            }
        }).start();
    }

    private void sendCardToBackend(String cardNum) {
        new Thread(() -> {
            String targetUrl = "https://ifs360-sg.com/api/card";
            String deviceSerial = getDeviceSerial();
            Log.e(TAG, ">>> [CARD-REQUEST] URL: " + targetUrl + " | Params: card_num=" + cardNum + ", serial_number=" + deviceSerial);
            try {
                URL url = new URL(targetUrl);
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
                        + "\"serial_number\": \"" + deviceSerial + "\""
                        + "}"
                        + "}";

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonInput.getBytes("utf-8"));
                }

                int responseCode = conn.getResponseCode();
                InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
                String responseText = "";
                if (is != null) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(is, "utf-8"));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null)
                        sb.append(line);
                    responseText = sb.toString();
                }

                if (responseCode == HttpURLConnection.HTTP_OK) {
                    JSONObject root = new JSONObject(responseText);
                    JSONObject result = root.optJSONObject("result");
                    String errorMessage = result != null ? result.optString("message", "") : "";

                    if (result != null && result.optBoolean("open_door", false)) {
                        if (plugin != null) plugin.sendToastMessage("Successfully open the door", true);
                        long delay = result.optLong("seconds_closing_door", 5) * 1000L;
                        triggerOpenDoor(delay);
                    } else {
                        if (errorMessage != "") {
                            if (plugin != null) plugin.sendToastMessage(errorMessage, false);
                        } else {
                            if (plugin != null) plugin.sendToastMessage("Failed to open the door", false);
                        }
                        temporaryRedLed();
                    }
                    Log.e(TAG, ">>> [CARD-RESPONSE-SUCCESS] Response: " + responseText);
                } else {
                    temporaryRedLed();
                    Log.e(TAG, ">>> [CARD-RESPONSE-FAIL] HTTP Code: " + responseCode + " | Response: " + responseText);
                    if (plugin != null) plugin.sendToastMessage("Failed to open the door", false);
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, ">>> [CARD-RESPONSE-ERROR] Exception: " + e.getMessage());
                if (plugin != null) plugin.sendToastMessage("Failed to open the door", false);
                temporaryRedLed();
            }
        }).start();
    }

    // =========================================================================
    // 🚪 HELPER HARDWARE (Buka Pintu & Kontrol LED)
    // =========================================================================

    private void triggerOpenDoor(long autoCloseDelayMs) {
        long effectiveDelay = autoCloseDelayMs > 0 ? autoCloseDelayMs : 3000L;
        new Handler(Looper.getMainLooper()).post(() -> {
            DMAccessUtil.getInstance().openDoor();
            temporaryGreenLed();

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeDoor();
                DMAccessUtil.getInstance().closeAllLed();
            }, effectiveDelay);
        });
    }

    private void temporaryGreenLed() {
        new Handler(Looper.getMainLooper()).post(() -> {
            DMAccessUtil.getInstance().openGreenLed(2000L);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeGreenLed();
            }, 2000L);
        });
    }

    private void temporaryRedLed() {
        new Handler(Looper.getMainLooper()).post(() -> {
            DMAccessUtil.getInstance().openRedLed(1000L);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeRedLed();
            }, 1000L);
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

    public void performSelfRestart() {
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                PendingIntent pendingIntent = PendingIntent.getActivity(
                    this,
                    9999,
                    intent,
                    PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (alarmManager != null) {
                    long triggerTime = System.currentTimeMillis() + 2000; // 2 seconds delay
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent);
                    } else {
                        alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent);
                    }
                }
            }
            Log.d(TAG, "Killing current process for self-restart...");
            DMAccessUtil.getInstance().closeRedLed();
            DMAccessUtil.getInstance().closeWhiteLed();
            DMAccessUtil.getInstance().closeGreenLed();
        } catch (Exception e) {
            Log.e(TAG, "Error during self-restart cleanup", e);
        } finally {
            android.os.Process.killProcess(android.os.Process.myPid());
            System.exit(0);
        }
    }
}
