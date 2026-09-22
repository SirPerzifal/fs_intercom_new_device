package io.ionic.starter;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.app.smdt.SmdtManagerNew;

public class DMAccessUtil {
    private static final String TAG = "DMAccessUtil";
    private static volatile DMAccessUtil instance;
    private SmdtManagerNew smdt;

    private final Handler ledHandler = new Handler(Looper.getMainLooper());
    private final Runnable autoCloseLedRunnable = this::closeAllLed;

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
     * mode: 1 = Normal Open, delaySeconds: waktu auto-close (detik)
     */
    public void openDoor() {
        if (smdt == null) return;
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

    public synchronized void openGreenLed(long autoCloseMs) {
        if (smdt != null) {
            smdt.dev_setLedLighted("LED_RED", false);
            smdt.dev_setLedLighted("LED_WHITE", false);
            smdt.dev_setLedLighted("LED_GREEN", true);
        }
        ledHandler.removeCallbacks(autoCloseLedRunnable);
        long delay = autoCloseMs > 0 ? autoCloseMs : 3000L;
        ledHandler.postDelayed(autoCloseLedRunnable, delay);
        Log.d(TAG, "Green LED ON (auto-close in " + delay + "ms)");
    }

    public void openGreenLed() {
        openGreenLed(3000L); // Default 3 detik auto-close
    }

    public synchronized void closeGreenLed() {
        ledHandler.removeCallbacks(autoCloseLedRunnable);
        if (smdt != null) smdt.dev_setLedLighted("LED_GREEN", false);
        Log.d(TAG, "Green LED OFF");
    }

    public synchronized void openRedLed(long autoCloseMs) {
        if (smdt != null) {
            smdt.dev_setLedLighted("LED_GREEN", false);
            smdt.dev_setLedLighted("LED_WHITE", false);
            smdt.dev_setLedLighted("LED_RED", true);
        }
        ledHandler.removeCallbacks(autoCloseLedRunnable);
        long delay = autoCloseMs > 0 ? autoCloseMs : 2000L;
        ledHandler.postDelayed(autoCloseLedRunnable, delay);
        Log.d(TAG, "Red LED ON (auto-close in " + delay + "ms)");
    }

    public void openRedLed() {
        openRedLed(2000L); // Default 2 detik auto-close
    }

    public synchronized void closeRedLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_RED", false);
        Log.d(TAG, "Red LED OFF");
    }

    public synchronized void openWhiteLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_WHITE", true);
        Log.d(TAG, "White LED ON");
    }

    public synchronized void closeWhiteLed() {
        if (smdt != null) smdt.dev_setLedLighted("LED_WHITE", false);
        Log.d(TAG, "White LED OFF");
    }

    public synchronized void closeAllLed() {
        ledHandler.removeCallbacks(autoCloseLedRunnable);
        if (smdt != null) {
            smdt.dev_setLedLighted("LED_WHITE", false);
            smdt.dev_setLedLighted("LED_RED", false);
            smdt.dev_setLedLighted("LED_GREEN", false);
        }
        Log.d(TAG, "All LEDs OFF");
    }

    // ========================
    // ⏱️ WATCHDOG
    // ========================

    public void feedWatchdog() {
        if (smdt != null) smdt.sys_setWatchDogFeed();
    }
}
