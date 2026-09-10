package io.ionic.starter.plugin;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.ionic.starter.DMAccessUtil;

@CapacitorPlugin(name = "Intercom")
public class IntercomPlugin extends Plugin {
    private static final String TAG = "IntercomPlugin";

    @Override
    public void load() {
        super.load();
        if (getActivity() instanceof io.ionic.starter.MainActivity) {
            ((io.ionic.starter.MainActivity) getActivity()).setPlugin(this);
        }
    }

    public void sendToastMessage(String message, boolean is_success) {
        Log.d(TAG, "sendToastMessage(): message=" + message + ", is_success=" + is_success);
        JSObject data = new JSObject();
        data.put("message", message);
        data.put("is_success", is_success);
        notifyListeners("sendToastMessage", data);
    }

    @PluginMethod
    public void openGateNative(PluginCall call) {
        Log.d(TAG, "openGateNative() dipanggil dari JS");
        try {
            DMAccessUtil.getInstance().openDoor();
            DMAccessUtil.getInstance().closeRedLed();
            DMAccessUtil.getInstance().closeWhiteLed();
            DMAccessUtil.getInstance().openGreenLed();

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeDoor();
                DMAccessUtil.getInstance().closeAllLed();
            }, 5000);

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Open gate error: " + e.getMessage());
            call.reject("Open gate error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openGreenLed(PluginCall call) {
        try {
            DMAccessUtil.getInstance().openGreenLed();
            call.resolve();
        } catch (Exception e) {
            call.reject("Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openRedLed(PluginCall call) {
        try {
            DMAccessUtil.getInstance().openRedLed();
            call.resolve();
        } catch (Exception e) {
            call.reject("Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void closeGateNative(PluginCall call) {
        try {
            DMAccessUtil.getInstance().closeDoor();
            DMAccessUtil.getInstance().closeAllLed();
            call.resolve();
        } catch (Exception e) {
            call.reject("Error closeGateNative: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        Log.d(TAG, "startScan() dipanggil dari Ionic JS");
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    io.ionic.starter.facepass.InitFacePassHandler.init(getActivity(), handler -> {
                        if (handler != null) {
                            io.ionic.starter.facepass.FacePassHelper.getInstance().setPlugin(this);
                            io.ionic.starter.facepass.FacePassHelper.getInstance().startScan();

                            JSObject ret = new JSObject();
                            ret.put("status", "started");
                            notifyListeners("scanStarted", ret);
                            call.resolve(ret);
                        } else {
                            call.reject("Gagal inisialisasi FacePass SDK");
                        }
                    });
                } catch (Exception e) {
                    Log.e(TAG, "Error startScan: " + e.getMessage());
                    call.reject("Error startScan: " + e.getMessage());
                }
            });
        } else {
            call.reject("Activity is null");
        }
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        Log.d(TAG, "stopScan() dipanggil dari Ionic JS");
        io.ionic.starter.facepass.FacePassHelper.getInstance().stopScan();
        call.resolve();
    }

    @PluginMethod
    public void closeLed(PluginCall call) {
        try {
            DMAccessUtil.getInstance().closeAllLed();
            call.resolve();
        } catch (Exception e) {
            call.reject("Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void fetchDataImages(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void TestScan(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void refreshFaceCamera(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void restartApp(PluginCall call) {
        call.resolve();
    }

    public void notifyFaceDetected(int faceCount) {
        JSObject data = new JSObject();
        data.put("faceCount", faceCount);
        notifyListeners("faceDetected", data);
    }

    public void emitFaceRecognized(String userId, int score, String userName) {
        JSObject data = new JSObject();
        data.put("userId", userId);
        data.put("userName", userName);
        data.put("score", score);
        data.put("recognized", true);
        notifyListeners("faceRecognized", data);
    }

    public void notifyNoFace() {
        notifyListeners("noFace", new JSObject());
    }
}
