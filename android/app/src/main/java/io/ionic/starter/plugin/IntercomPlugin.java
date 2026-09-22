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
        Log.d(TAG, "openGateNative() called from JS");
        try {
            long duration = 5000L;
            if (call.hasOption("duration")) {
                duration = call.getLong("duration", 5000L);
            }
            long finalDuration = duration > 0 ? duration : 5000L;
            DMAccessUtil.getInstance().openDoor();
            DMAccessUtil.getInstance().openGreenLed(finalDuration);

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeDoor();
                DMAccessUtil.getInstance().closeAllLed();
            }, finalDuration);

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Open gate error: " + e.getMessage());
            call.reject("Open gate error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openGreenLed(PluginCall call) {
        try {
            long duration = 3000L;
            if (call.hasOption("duration")) {
                duration = call.getLong("duration", 3000L);
            }
            DMAccessUtil.getInstance().openGreenLed(duration);
            call.resolve();
        } catch (Exception e) {
            call.reject("Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openRedLed(PluginCall call) {
        try {
            long duration = 2000L;
            if (call.hasOption("duration")) {
                duration = call.getLong("duration", 2000L);
            }
            DMAccessUtil.getInstance().openRedLed(duration);
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
        Log.d(TAG, "startScan() called from Ionic JS");
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    io.ionic.starter.facepass.InitFacePassHandler.init(getActivity(), handler -> {
                        if (handler != null) {
                            io.ionic.starter.facepass.FacePassHelper.getInstance().setPlugin(this);
                            io.ionic.starter.facepass.FacePassHelper.getInstance().startScan();
                            io.ionic.starter.facepass.FloatingCameraOverlay.start(getContext());

                            JSObject ret = new JSObject();
                            ret.put("status", "started");
                            call.resolve(ret);
                        } else {
                            call.reject("Failed to initialize FacePass SDK");
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
        Log.d(TAG, "stopScan() called from Ionic JS");
        io.ionic.starter.facepass.FacePassHelper.getInstance().stopScan();
        io.ionic.starter.facepass.FloatingCameraOverlay.stop(getContext());
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
        Log.d(TAG, "fetchDataImages() plugin method triggered from Ionic JS");
        new Thread(() -> {
            try {
                io.ionic.starter.facepass.FacePassHelper.getInstance().syncFacesFromBackend();
                JSObject ret = new JSObject();
                ret.put("status", "completed");
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Error in fetchDataImages: " + e.getMessage(), e);
                call.reject("Error in fetchDataImages: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void getEnrolledFaces(PluginCall call) {
        try {
            org.json.JSONArray faces = io.ionic.starter.facepass.FacePassHelper.getInstance().getEnrolledFaces();
            com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
            com.getcapacitor.JSArray jsArray = new com.getcapacitor.JSArray();
            for (int i = 0; i < faces.length(); i++) {
                org.json.JSONObject obj = faces.getJSONObject(i);
                com.getcapacitor.JSObject faceItem = new com.getcapacitor.JSObject();
                faceItem.put("id", obj.optString("id"));
                faceItem.put("name", obj.optString("name"));
                jsArray.put(faceItem);
            }
            ret.put("faces", jsArray);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error in getEnrolledFaces: " + e.getMessage(), e);
            call.reject("Error in getEnrolledFaces: " + e.getMessage());
        }
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
