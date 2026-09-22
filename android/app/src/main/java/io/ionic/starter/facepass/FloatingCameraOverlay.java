package io.ionic.starter.facepass;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.hardware.Camera;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.core.app.NotificationCompat;

import io.ionic.starter.R;

public class FloatingCameraOverlay extends Service {
    private static final String TAG = "FloatingCameraOverlay";
    private static FloatingCameraOverlay instance;
    private WindowManager windowManager;
    private FrameLayout rootLayout;
    private Camera camera;
    private long lastDetectTime = 0;

    private long overlayFrameCounter = 0;
    private boolean isViewAdded = false;
    private android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private Runnable addViewRunnable;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        Log.d(TAG, ">>> [OVERLAY-ONCREATE] FloatingCameraOverlay service onCreate triggered");

        // 1. Create notification channel (Android 8+ REQUIRED for Foreground Service)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Log.d(TAG, ">>> [OVERLAY-NOTIF] Creating NotificationChannel 'camera_channel'...");
            NotificationChannel channel = new NotificationChannel(
                    "camera_channel",
                    "Camera Service",
                    NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                Log.d(TAG, ">>> [OVERLAY-NOTIF] NotificationChannel created successfully.");
            }
        }

        // 2. Create notification
        Notification notification = new NotificationCompat.Builder(this, "camera_channel")
                .setContentTitle("Face Detection Active")
                .setContentText("Camera is scanning faces")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .build();

        startForeground(1, notification);
        Log.d(TAG, ">>> [OVERLAY-FOREGROUND] Service promoted to Foreground Service with notification ID 1");

        // 3. Setup Floating SurfaceView Overlay
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        rootLayout = new FrameLayout(this);

        SurfaceView surfaceView = new SurfaceView(this);
        // surfaceView.setScaleX(-1.0f); Flip horizontally to un-mirror front preview
        // display
        FrameLayout.LayoutParams surfaceParams = new FrameLayout.LayoutParams(360, 310);
        rootLayout.addView(surfaceView, surfaceParams);
        Log.d(TAG, ">>> [OVERLAY-SURFACEVIEW] SurfaceView added to FrameLayout (360x310, un-mirrored scaleX=-1.0f)");

        surfaceView.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override
            public void surfaceCreated(SurfaceHolder holder) {
                Log.d(TAG, ">>> [OVERLAY-SURFACE-CREATED] SurfaceView surface created! Holder is valid: "
                        + (holder != null && holder.getSurface().isValid()));
                try {
                    try {
                        Log.d(TAG, ">>> [OVERLAY-CAM-OPEN] Attempting to open Camera 0 (Primary RGB Camera)...");
                        camera = Camera.open(0);
                        Log.d(TAG, ">>> [OVERLAY-CAM-OPEN] Successfully opened Camera 0 (RGB)");
                    } catch (Exception e) {
                        Log.e(TAG, ">>> [OVERLAY-CAM-OPEN-WARN] Failed to open Camera 0: " + e.getMessage()
                                + ", trying Camera 1 fallback...", e);
                        camera = Camera.open(1);
                        Log.d(TAG, ">>> [OVERLAY-CAM-OPEN] Successfully opened Camera 1 (Fallback)");
                    }

                    if (camera == null) {
                        Log.e(TAG, ">>> [OVERLAY-CAM-FATAL] Unable to open any hardware camera!");
                        return;
                    }

                    Camera.Parameters parameters = camera.getParameters();
                    Log.d(TAG,
                            ">>> [OVERLAY-CAM-PARAMS] Configuring Camera parameters: previewSize=640x480, rotation=90");
                    parameters.setPreviewSize(640, 480);
                    parameters.setRotation(90);
                    camera.setDisplayOrientation(90);
                    camera.setParameters(parameters);
                    Log.d(TAG, ">>> [OVERLAY-CAM-PARAMS] Camera parameters applied successfully.");

                    camera.setPreviewDisplay(holder);
                    Log.d(TAG, ">>> [OVERLAY-CAM-DISPLAY] setPreviewDisplay(holder) configured.");

                    overlayFrameCounter = 0;
                    camera.setPreviewCallback(new Camera.PreviewCallback() {
                        @Override
                        public void onPreviewFrame(byte[] data, Camera camera) {
                            if (data == null) {
                                Log.w(TAG, ">>> [OVERLAY-FRAME-NULL] Received null data in onPreviewFrame!");
                                return;
                            }

                            overlayFrameCounter++;
                            if (overlayFrameCounter == 1) {
                                Log.d(TAG, ">>> [OVERLAY-FRAME-STREAM] First camera frame received! Data size: "
                                        + data.length + " bytes");
                            } else if (overlayFrameCounter % 30 == 0) {
                                Log.d(TAG, ">>> [OVERLAY-FRAME-STREAM] Received frame #" + overlayFrameCounter
                                        + " (data length: " + data.length + " bytes)");
                            }

                            long now = System.currentTimeMillis();
                            if (now - lastDetectTime > 80) { // ~12 FPS for AI processing
                                lastDetectTime = now;
                                FacePassHelper.getInstance().processFrame(data, 640, 480, 90);
                            }
                        }
                    });

                    camera.startPreview();
                    Log.d(TAG, ">>> [OVERLAY-CAM-PREVIEW-START] Camera preview started on SurfaceView overlay!");
                } catch (Exception e) {
                    Log.e(TAG, ">>> [OVERLAY-CAM-ERROR] Exception in surfaceCreated: " + e.getMessage(), e);
                }
            }

            @Override
            public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
                Log.d(TAG, ">>> [OVERLAY-SURFACE-CHANGED] Surface changed: format=" + format + ", width=" + width
                        + ", height=" + height);
            }

            @Override
            public void surfaceDestroyed(SurfaceHolder holder) {
                Log.d(TAG,
                        ">>> [OVERLAY-SURFACE-DESTROYED] SurfaceView surface destroyed. Releasing camera resources...");
                if (camera != null) {
                    try {
                        camera.setPreviewCallback(null);
                        camera.stopPreview();
                        camera.release();
                        Log.d(TAG, ">>> [OVERLAY-SURFACE-DESTROYED] Camera preview stopped and camera released.");
                    } catch (Exception e) {
                        Log.e(TAG, ">>> [OVERLAY-SURFACE-DESTROYED-ERROR] Error releasing camera: " + e.getMessage(),
                                e);
                    }
                    camera = null;
                }
            }
        });

        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        Log.d(TAG, ">>> [OVERLAY-WINDOW-PARAMS] Creating LayoutParams (360x310, type=" + overlayType + ")");
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                360,
                310,
                overlayType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);

        params.gravity = Gravity.CENTER;
        params.x = 0;
        params.y = -45;

        addViewRunnable = () -> {
            if (instance != null && windowManager != null && rootLayout != null && !isViewAdded) {
                try {
                    windowManager.addView(rootLayout, params);
                    isViewAdded = true;
                    Log.d(TAG, ">>> [OVERLAY-WINDOW-ADDED] Floating Window Overlay added to WindowManager after 300ms animation delay!");
                } catch (Exception e) {
                    Log.e(TAG, ">>> [OVERLAY-WINDOW-ERROR] Failed to add view to WindowManager: " + e.getMessage(), e);
                }
            }
        };

        // Post with 300ms delay to align with Ionic UI popup transition animation
        mainHandler.postDelayed(addViewRunnable, 300);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, ">>> [OVERLAY-ONDESTROY] FloatingCameraOverlay onDestroy called.");
        instance = null;
        if (mainHandler != null && addViewRunnable != null) {
            mainHandler.removeCallbacks(addViewRunnable);
        }
        if (isViewAdded && rootLayout != null && windowManager != null) {
            try {
                windowManager.removeView(rootLayout);
                isViewAdded = false;
                Log.d(TAG, ">>> [OVERLAY-ONDESTROY] Floating Window Overlay removed from WindowManager.");
            } catch (Exception e) {
                Log.e(TAG, ">>> [OVERLAY-ONDESTROY-ERROR] Error removing view from WindowManager: " + e.getMessage(),
                        e);
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public static void start(Context ctx) {
        Log.d(TAG, ">>> [OVERLAY-START-CMD] start() command called with Context: "
                + (ctx != null ? ctx.getClass().getName() : "null"));
        Intent i = new Intent(ctx, FloatingCameraOverlay.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
            Log.d(TAG, ">>> [OVERLAY-START-CMD] startForegroundService executed.");
        } else {
            ctx.startService(i);
            Log.d(TAG, ">>> [OVERLAY-START-CMD] startService executed.");
        }
    }

    public static void stop(Context ctx) {
        Log.d(TAG, ">>> [OVERLAY-STOP-CMD] stop() command called.");
        Intent i = new Intent(ctx, FloatingCameraOverlay.class);
        ctx.stopService(i);
        Log.d(TAG, ">>> [OVERLAY-STOP-CMD] stopService executed.");
    }

    private byte[] rotateNV21_90(byte[] data, int imageWidth, int imageHeight) {
        if (data == null)
            return null;
        byte[] yuv = new byte[imageWidth * imageHeight * 3 / 2];
        int wh = imageWidth * imageHeight;
        int uvHeight = imageHeight >> 1;
        int k = 0;
        for (int i = 0; i < imageWidth; i++) {
            int nPos = 0;
            for (int j = 0; j < imageHeight; j++) {
                yuv[k] = data[nPos + i];
                k++;
                nPos += imageWidth;
            }
        }

        for (int i = 0; i < imageWidth; i += 2) {
            int nPos = wh;
            for (int j = 0; j < uvHeight; j++) {
                yuv[k] = data[nPos + i];
                yuv[k + 1] = data[nPos + i + 1];
                k += 2;
                nPos += imageWidth;
            }
        }
        return yuv;
    }
}
