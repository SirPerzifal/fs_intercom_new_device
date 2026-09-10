package io.ionic.starter.facepass;

import android.util.Log;
import io.ionic.starter.DMAccessUtil;
import io.ionic.starter.plugin.IntercomPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import mcv.facepass.FacePassHandler;
import mcv.facepass.types.FacePassDetectionResult;
import mcv.facepass.types.FacePassImage;
import mcv.facepass.types.FacePassImageType;
import mcv.facepass.types.FacePassRecognitionResult;
import mcv.facepass.types.FacePassRecognitionState;
import mcv.facepass.types.FacePassTrackOptions;

public class FacePassHelper {
    private static final String TAG = "FacePassHelper";
    private static FacePassHelper instance;
    private IntercomPlugin plugin;
    private boolean isScanning = false;
    private long lastFaceSendTime = 0;

    public static synchronized FacePassHelper getInstance() {
        if (instance == null) {
            instance = new FacePassHelper();
        }
        return instance;
    }

    public void setPlugin(IntercomPlugin plugin) {
        this.plugin = plugin;
    }

    public void startScan() {
        this.isScanning = true;
        Log.d(TAG, "FacePass scanning started");
    }

    public void stopScan() {
        this.isScanning = false;
        Log.d(TAG, "FacePass scanning stopped");
    }

    public boolean isScanning() {
        return isScanning;
    }

    public void processFrame(byte[] nv21Data, int width, int height, int rotation) {
        if (!isScanning)
            return;

        FacePassHandler handler = InitFacePassHandler.getHandler();
        if (handler == null)
            return;

        try {
            FacePassImage imageRGB = new FacePassImage(nv21Data, width, height, rotation, FacePassImageType.NV21);
            FacePassDetectionResult detectionResult = handler.feedFrame(imageRGB);

            if (detectionResult != null && detectionResult.faceList != null && detectionResult.faceList.length > 0) {
                if (plugin != null) {
                    plugin.notifyFaceDetected(detectionResult.faceList.length);
                }

                if (detectionResult.message != null && detectionResult.message.length > 0) {
                    FacePassTrackOptions[] trackOpts = new FacePassTrackOptions[detectionResult.images.length];
                    for (int i = 0; i < detectionResult.images.length; i++) {
                        trackOpts[i] = new FacePassTrackOptions(detectionResult.images[i].trackId, 65f, 65f, 85f,
                                -1.0f);
                    }

                    FacePassRecognitionResult[][] recognizeResultArray = handler
                            .recognize(InitFacePassHandler.GROUP_NAME, detectionResult.message, 1, trackOpts);
                    if (recognizeResultArray != null && recognizeResultArray.length > 0) {
                        for (FacePassRecognitionResult[] recognizeResult : recognizeResultArray) {
                            if (recognizeResult != null && recognizeResult.length > 0) {
                                for (FacePassRecognitionResult result : recognizeResult) {
                                    if (result != null
                                            && result.recognitionState == FacePassRecognitionState.RECOGNITION_PASS) {
                                        String faceToken = new String(result.faceToken, StandardCharsets.ISO_8859_1);
                                        // int score = (int) result.searchScore;
                                        int score = 100;

                                        Log.e(TAG, ">>> [FACE RECOGNIZED] FaceToken: " + faceToken + ", Score: " + score
                                                + "%");

                                        if (plugin != null) {
                                            plugin.emitFaceRecognized(faceToken, score, "Resident #" + result.trackId);
                                        }

                                        long now = System.currentTimeMillis();
                                        if (now - lastFaceSendTime > 4000) {
                                            lastFaceSendTime = now;
                                            sendFaceToBackend(faceToken);
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                if (plugin != null) {
                    plugin.notifyNoFace();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in FacePass processFrame: " + e.getMessage());
        }
    }

    private void sendFaceToBackend(String faceToken) {
        new Thread(() -> {
            try {
                URL url = new URL("https://ifs360-sg.com/api/face");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                String jsonInput = "{"
                        + "\"jsonrpc\": \"2.0\","
                        + "\"params\": {"
                        + "\"face_token\": \"" + faceToken + "\","
                        + "\"device_serial\": \"" + getDeviceSerial() + "\""
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
                    if (result != null && result.optBoolean("open_door", false)) {
                        long delay = result.optLong("seconds_closing_door", 5) * 1000L;
                        triggerOpenDoor(delay);
                        if (plugin != null) {
                            plugin.sendToastMessage("Successfully open the door", true);
                        }
                    } else {
                        if (plugin != null) {
                            String msg = result != null ? result.optString("message", "Face not recognized")
                                    : "Face not recognized";
                            plugin.sendToastMessage(msg, false);
                        }
                    }
                    Log.e(TAG, "Backend Face verification response: " + sb.toString());
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Error sending Face to backend: " + e.getMessage());
            }
        }).start();
    }

    private void triggerOpenDoor(long autoCloseDelayMs) {
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            DMAccessUtil.getInstance().openDoor();
            DMAccessUtil.getInstance().closeRedLed();
            DMAccessUtil.getInstance().closeWhiteLed();
            DMAccessUtil.getInstance().openGreenLed();

            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeDoor();
                DMAccessUtil.getInstance().closeAllLed();
            }, autoCloseDelayMs);
        });
    }

    private String getDeviceSerial() {
        try {
            return android.os.Build.SERIAL;
        } catch (Exception e) {
            return "UNKNOWN";
        }
    }
}
