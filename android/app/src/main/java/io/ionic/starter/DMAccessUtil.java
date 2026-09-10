package io.ionic.starter;

import android.content.Context;
import android.util.Log;
import android.app.smdt.SmdtManagerNew;

public class DMAccessUtil {
    private static final String TAG = "DMAccessUtil";
    private static volatile DMAccessUtil instance;
    private SmdtManagerNew smdt;

    private DMAccessUtil() {}

    public static DMAccessUtil getInstance() {
        if (instance == null) {
            synchronized (DMAccessUtil.class) {
                if (instance == null) {
                    instance = new DMAccessUtil();
                }
            }
        }
        return instance;
    }

    public void init(Context context) {
        smdt = SmdtManagerNew.getInstance(context);
        Log.d(TAG, "SmdtManagerNew initialized");
    }

    // ========================
    // 🚪 KONTROL RELAY PINTU
    // ========================

    /**
     * Buka pintu relay.
     * mode: 0 = Normal Closed, 1 = Normal Open, 2 = Toggle
     * delaySeconds: waktu auto-close (detik)
     */
    public void openDoor() {
        if (smdt == null) return;
        // Set mode dan delay auto-close 5 detik (sesuai demo vendor)
        smdt.custom_setRelayIoMode(1, 5);
        smdt.custom_setRelayIoEnable(true);
        Log.d(TAG, "Door opened (relay ON)");
    }

    public void closeDoor() {
        if (smdt == null) return;
        smdt.custom_setRelayIoEnable(false);
        Log.d(TAG, "Door closed (relay OFF)");
    }

    // ========================
    // 💡 KONTROL LAMPU LED
    // ========================

    public void openGreenLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_GREEN", true);
    }

    public void closeGreenLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_GREEN", false);
    }

    public void openRedLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_RED", true);
    }

    public void closeRedLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_RED", false);
    }

    public void openWhiteLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_WHITE", true);
    }

    public void closeWhiteLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_WHITE", false);
    }

    public void closeAllLed() {
        closeRedLed();
        closeGreenLed();
        closeWhiteLed();
    }

    // ========================
    // ⏱️ WATCHDOG
    // ========================

    public void feedWatchdog() {
        if (smdt != null) smdt.sys_setWatchDogFeed();
    }
}
