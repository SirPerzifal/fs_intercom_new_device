package io.ionic.starter.facepass;

import android.util.Log;
import io.ionic.starter.DMAccessUtil;
import io.ionic.starter.plugin.IntercomPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
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

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class FacePassHelper {
    private static final String TAG = "FacePassHelper";
    private static FacePassHelper instance;
    private IntercomPlugin plugin;
    private boolean isScanning = false;
    private long lastFaceSendTime = 0;
    private long frameCounter = 0;
    private ScheduledExecutorService faceSyncScheduler;

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
        this.frameCounter = 0;
        Log.d(TAG, ">>> [CAM-SCANNING-STARTED] Face recognition scanning session started.");
    }

    public void stopScan() {
        this.isScanning = false;
        Log.d(TAG, ">>> [CAM-SCANNING-STOPPED] Face recognition scanning session stopped.");
    }

    public boolean isScanning() {
        return isScanning;
    }

    public void processFrame(byte[] nv21Data, int width, int height, int rotation) {
        if (!isScanning)
            return;

        frameCounter++;
        if (frameCounter == 1) {
            Log.d(TAG, ">>> [CAM-SCANNING-IN-PROGRESS] Camera stream connected & actively scanning faces! Resolution: "
                    + width + "x" + height);
        } else if (frameCounter % 30 == 0) {
            Log.d(TAG, ">>> [CAM-SCANNING-IN-PROGRESS] Actively scanning frame #" + frameCounter + " (" + width + "x"
                    + height + ")...");
        }

        FacePassHandler handler = InitFacePassHandler.getHandler();
        if (handler == null) {
            if (frameCounter % 60 == 0) {
                Log.e(TAG, "[CAM-FRAME-ERROR] FacePass Handler is null! Initialization incomplete.");
            }
            return;
        }

        try {
            FacePassImage imageRGB = new FacePassImage(nv21Data, width, height, rotation, FacePassImageType.NV21);
            FacePassDetectionResult detectionResult = handler.feedFrame(imageRGB);

            if (detectionResult != null && detectionResult.faceList != null && detectionResult.faceList.length > 0) {
                int count = detectionResult.faceList.length;
                Log.d(TAG, ">>> [CAM-DETECT-FACE] " + count + " face(s) detected at frame #" + frameCounter);

                if (plugin != null) {
                    plugin.notifyFaceDetected(count);
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
                                        String sdkFaceToken = new String(result.faceToken, StandardCharsets.ISO_8859_1);
                                        String faceId = faceTokenToIdMap.getOrDefault(sdkFaceToken, sdkFaceToken);
                                        int score = 100;

                                        Log.e(TAG, ">>> [CAM-RECOGNIZED-PASS] Face Matched! SDK Token: " + sdkFaceToken
                                                + ", Backend FaceID: " + faceId + ", TrackId: " + result.trackId);

                                        if (plugin != null) {
                                            plugin.emitFaceRecognized(faceId, score, "Resident #" + result.trackId);
                                        }

                                        long now = System.currentTimeMillis();
                                        if (now - lastFaceSendTime > 4000) {
                                            lastFaceSendTime = now;
                                            Log.d(TAG, "[CAM-BACKEND-SEND] Sending FaceID (" + faceId + ") to backend /api/face_recog...");
                                            sendFaceToBackend(faceId);
                                        }
                                        break;
                                    } else if (result != null) {
                                        Log.d(TAG, "[CAM-RECOGNIZED-FAIL] Face detected but match status: "
                                                + result.recognitionState);
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                if (frameCounter % 15 == 0) {
                    Log.d(TAG, ">>> [CAM-NO-FACE] 0 faces detected at frame #" + frameCounter
                            + " (actively searching...)");
                }
                if (plugin != null) {
                    plugin.notifyNoFace();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, ">>> [CAM-PROCESS-EXCEPTION] Error in FacePass processFrame: " + e.getMessage(), e);
        }
    }

    private void sendFaceToBackend(String faceId) {
        new Thread(() -> {
            try {
                URL url = new URL("https://ifs360-sg.com/api/face_recog");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                String jsonInput = "{"
                        + "\"jsonrpc\": \"2.0\","
                        + "\"params\": {"
                        + "\"faceId\": \"" + faceId + "\","
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
                    if (result != null) {
                        if ("ignored".equals(result.optString("status"))) {
                            Log.d(TAG, ">>> [FACE-RECOG-RESP] Scan ignored by backend (cooldown active).");
                            return;
                        }
                        boolean openDoor = result.optBoolean("open_door", false);
                        String familyName = result.optString("family_name", "");
                        long delay = result.optLong("seconds_closing_door", 5000L);
                        if (delay < 100) {
                            delay = delay * 1000L;
                        }

                        if (openDoor) {
                            triggerOpenDoor(delay);
                            String msg = familyName.isEmpty() ? "Successfully open the door" : "Welcome, " + familyName;
                            if (plugin != null) {
                                plugin.sendToastMessage(msg, true);
                            }
                        } else {
                            String msg = result.optString("message", "Face not recognized / Access Denied");
                            if (plugin != null) {
                                plugin.sendToastMessage(msg, false);
                            }
                        }
                    }
                    Log.d(TAG, ">>> [FACE-RECOG-RESP] Response: " + (result != null ? result.toString() : sb.toString()));
                } else {
                    Log.e(TAG, ">>> [FACE-RECOG-FAIL] HTTP Code: " + conn.getResponseCode());
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, ">>> [FACE-RECOG-ERROR] Exception sending Face to backend: " + e.getMessage(), e);
            }
        }).start();
    }

    private final java.util.Map<String, String> faceTokenToIdMap = new java.util.concurrent.ConcurrentHashMap<>();

    public String addFaceBitmapWithId(android.graphics.Bitmap bitmap, String backendFaceId) {
        if (bitmap == null)
            return null;
        FacePassHandler handler = InitFacePassHandler.getHandler();
        if (handler == null) {
            Log.e(TAG, "[FACE-ENROLL-ERROR] FacePassHandler is null!");
            return null;
        }

        try {
            mcv.facepass.types.FacePassAddFaceResult addResult = handler.addFace(bitmap);
            if (addResult != null && addResult.result == 0) {
                String faceToken = new String(addResult.faceToken, StandardCharsets.ISO_8859_1);
                boolean bindOk = handler.bindGroup(InitFacePassHandler.GROUP_NAME, addResult.faceToken);
                if (backendFaceId != null && !backendFaceId.isEmpty()) {
                    faceTokenToIdMap.put(faceToken, backendFaceId);
                }
                Log.d(TAG,
                        ">>> [FACE-ENROLL-SUCCESS] Enrolled SDK faceToken: " + faceToken + " -> Backend FaceID: " + backendFaceId + ", bindGroup result: " + bindOk);
                return faceToken;
            } else {
                int errorCode = addResult != null ? addResult.result : -1;
                Log.e(TAG, ">>> [FACE-ENROLL-FAIL] addFace failed with error code: " + errorCode);
            }
        } catch (Exception e) {
            Log.e(TAG, ">>> [FACE-ENROLL-EXCEPTION] Error enrolling face bitmap: " + e.getMessage(), e);
        }
        return null;
    }

    public boolean addFaceBitmap(android.graphics.Bitmap bitmap) {
        return addFaceBitmapWithId(bitmap, null) != null;
    }

    private final java.util.List<JSONObject> enrolledFacesList = new java.util.concurrent.CopyOnWriteArrayList<>();

    public JSONArray getEnrolledFaces() {
        JSONArray array = new JSONArray();
        for (JSONObject item : enrolledFacesList) {
            array.put(item);
        }
        return array;
    }

    public void syncFacesFromBackend() {
        String serial = getDeviceSerial();
        String targetUrl = "https://ifs360-sg.com/api/image-info?serial_number=" + serial;
        Log.e(TAG, ">>> [DEVICE-SERIAL-INFO] DEVICE SERIAL NUMBER: " + serial);
        Log.d(TAG, ">>> [FACE-SYNC-START] Fetching registered face images from backend [METHOD: GET] (URL: " + targetUrl + ") for serial: " + serial);
        try {
            URL url = new URL(targetUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "AndroidApp/1.0");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int responseCode = conn.getResponseCode();
            InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
            String responseText = "";
            if (is != null) {
                BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }
                responseText = sb.toString();
            }

            if (responseCode == HttpURLConnection.HTTP_OK) {
                try {
                    JSONObject root = new JSONObject(responseText);

                    if (root.has("error")) {
                        Log.e(TAG, ">>> [FACE-SYNC-ERROR] Backend returned error: " + root.opt("error"));
                    }

                    // 1. Process faces array from "result"
                    org.json.JSONArray faces = root.optJSONArray("result");
                    if (faces != null && faces.length() > 0) {
                        StringBuilder summaryLog = new StringBuilder();
                        for (int i = 0; i < faces.length(); i++) {
                            JSONObject f = faces.getJSONObject(i);
                            String fId = f.optString("id", "N/A");
                            String fName = f.optString("name", f.optString("family_name", "N/A"));
                            if (i > 0) summaryLog.append(", ");
                            summaryLog.append("[ID: ").append(fId).append(" | Name: ").append(fName).append("]");
                        }
                        Log.d(TAG, ">>> [FACE-SYNC-RESPONSE] HTTP Code: " + responseCode + " | Fetched " + faces.length() + " face record(s): " + summaryLog.toString());
                        int successCount = 0;
                        for (int i = 0; i < faces.length(); i++) {
                            JSONObject faceObj = faces.getJSONObject(i);
                            String faceIdStr = faceObj.optString("id", faceObj.optString("family_name", "item_" + (i + 1)));
                            String name = faceObj.optString("name", faceObj.optString("family_name", "Resident " + faceIdStr));
                            String imageUrl = faceObj.optString("imageUrl", faceObj.optString("image_url", ""));
                            String base64Data = faceObj.optString("image", faceObj.optString("base64_data", ""));

                            Log.d(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Processing ID: " + faceIdStr 
                                    + " (" + name + ") | Has URL: " + !imageUrl.isEmpty() 
                                    + " | Has Base64: " + !base64Data.isEmpty());

                            android.graphics.Bitmap bitmap = null;
                            if (!base64Data.isEmpty()) {
                                try {
                                    Log.d(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Decoding Base64 data (length: " + base64Data.length() + ")...");
                                    byte[] decoded = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                                    bitmap = android.graphics.BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
                                    if (bitmap == null) {
                                        Log.e(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Failed to decode Bitmap from Base64 data!");
                                    }
                                } catch (Exception b64Ex) {
                                    Log.e(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Exception decoding Base64 data: " + b64Ex.getMessage());
                                }
                            } else if (!imageUrl.isEmpty()) {
                                try {
                                    Log.d(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Downloading image from URL: " + imageUrl);
                                    InputStream in = new URL(imageUrl).openStream();
                                    bitmap = android.graphics.BitmapFactory.decodeStream(in);
                                    if (bitmap == null) {
                                        Log.e(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Failed to decode Bitmap from URL: " + imageUrl);
                                    }
                                } catch (Exception imgEx) {
                                    Log.e(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Exception downloading image from URL (" + imageUrl + "): " + imgEx.getMessage());
                                }
                            } else {
                                Log.e(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Skip: Neither image nor imageUrl found in JSON object: " + faceObj.toString());
                            }

                            if (bitmap != null) {
                                Log.d(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Bitmap decoded successfully (" + bitmap.getWidth() + "x" + bitmap.getHeight() + "). Enrolling into FacePass SDK...");
                                String sdkToken = addFaceBitmapWithId(bitmap, faceIdStr);
                                if (sdkToken != null) {
                                    successCount++;
                                    // Append to enrolled list if not already present
                                    boolean alreadyInList = false;
                                    for (JSONObject item : enrolledFacesList) {
                                        if (faceIdStr.equals(item.optString("id"))) {
                                            alreadyInList = true;
                                            break;
                                        }
                                    }
                                    if (!alreadyInList) {
                                        JSONObject enrolledItem = new JSONObject();
                                        enrolledItem.put("id", faceIdStr);
                                        enrolledItem.put("name", name);
                                        enrolledFacesList.add(enrolledItem);
                                    }
                                    Log.d(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Successfully enrolled face ID: " + faceIdStr + " (" + name + ")");
                                } else {
                                    Log.e(TAG, ">>> [FACE-ITEM #" + (i + 1) + "] Failed to enroll face ID: " + faceIdStr + " into FacePass SDK!");
                                }
                            }
                        }
                        Log.d(TAG, ">>> [FACE-SYNC-COMPLETE] Successfully synced & enrolled " + successCount + " / "
                                + faces.length() + " face images for Serial: " + serial);
                    } else {
                        Log.d(TAG, ">>> [FACE-SYNC-NO-FACES] No face records returned in 'result' for serial: " + serial);
                    }

                    // 2. Process users_to_delete if returned by backend
                    org.json.JSONArray usersToDelete = root.optJSONArray("users_to_delete");
                    if (usersToDelete != null && usersToDelete.length() > 0) {
                        Log.d(TAG, ">>> [FACE-SYNC-DELETE] Backend reported " + usersToDelete.length() + " user(s) to delete: " + usersToDelete.toString());
                        for (int d = 0; d < usersToDelete.length(); d++) {
                            JSONObject delObj = usersToDelete.getJSONObject(d);
                            String delId = delObj.optString("id");
                            enrolledFacesList.removeIf(item -> delId.equals(item.optString("id")));
                        }
                    }
                } catch (Exception parseEx) {
                    Log.e(TAG, ">>> [FACE-SYNC-JSON-EXCEPTION] Exception parsing JSON response: " + parseEx.getMessage(), parseEx);
                }
            } else {
                Log.e(TAG, ">>> [FACE-SYNC-FAIL] HTTP Request Failed! URL: " + targetUrl + " | HTTP Code: " + responseCode + " | Response: " + responseText);
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, ">>> [FACE-SYNC-ERROR] URL: " + targetUrl + " | Exception syncing faces: " + e.getMessage(), e);
        }
    }

    private void triggerOpenDoor(long autoCloseDelayMs) {
        long effectiveDelay = autoCloseDelayMs > 0 ? autoCloseDelayMs : 3000L;
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            DMAccessUtil.getInstance().openDoor();
            DMAccessUtil.getInstance().closeRedLed();
            DMAccessUtil.getInstance().closeWhiteLed();
            DMAccessUtil.getInstance().openGreenLed(effectiveDelay);

            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                DMAccessUtil.getInstance().closeDoor();
                DMAccessUtil.getInstance().closeAllLed();
            }, effectiveDelay);
        });
    }

    public synchronized void startPeriodicFaceSync() {
        if (faceSyncScheduler != null && !faceSyncScheduler.isShutdown()) {
            Log.d(TAG, "[FACE-SYNC-INIT] Native Java periodic face sync already running.");
            return;
        }
        String serial = getDeviceSerial();
        Log.e(TAG, ">>> [FACE-SYNC-INIT] STARTING PERIODIC FACE SYNC FOR DEVICE SERIAL: " + serial);
        faceSyncScheduler = Executors.newSingleThreadScheduledExecutor();
        // Schedule immediately (0s delay) and repeat every 5 minutes
        faceSyncScheduler.scheduleAtFixedRate(() -> {
            try {
                syncFacesFromBackend();
            } catch (Exception e) {
                Log.e(TAG, ">>> [FACE-SYNC-ERROR] Error in periodic face sync thread: " + e.getMessage(), e);
            }
        }, 0, 5, TimeUnit.MINUTES);
        Log.d(TAG, ">>> [FACE-SYNC-INIT] Native Java periodic face sync scheduled every 5 minutes!");
    }

    public String getDeviceSerial() {
        try {
            String serial = android.os.Build.SERIAL;
            Log.e(TAG, ">>> [GET-DEVICE-SERIAL] android.os.Build.SERIAL = " + serial);
            return serial;
        } catch (Exception e) {
            Log.e(TAG, ">>> [GET-DEVICE-SERIAL-ERROR] Exception getting serial: " + e.getMessage(), e);
            return "UNKNOWN";
        }
    }
}
