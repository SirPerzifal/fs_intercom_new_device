package io.ionic.starter.facepass;

import android.app.Activity;
import android.content.Context;
import android.os.Environment;
import android.text.TextUtils;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import mcv.facepass.FacePassException;
import mcv.facepass.FacePassHandler;
import mcv.facepass.auth.FacePassAuthCode;
import mcv.facepass.types.FacePassConfig;
import mcv.facepass.types.FacePassModel;
import mcv.facepass.types.FacePassPose;

public class InitFacePassHandler {
    private static final String TAG = "InitFacePassHandler";
    public static final String GROUP_NAME = "facex_face";
    public static final String CERT_FILENAME = "CBG_Android_Face_Reco---30-Trial-one-stage.cert";
    private static FacePassHandler mFacePassHandler;

    public interface IFacePassInit {
        void result(FacePassHandler facePassHandler);
    }

    private static boolean initSDKAuth(Context context) {
        Log.d(TAG, ">>> [CAM-AUTH-START] Verifying FacePass SDK Hardware License...");
        try {
            Context mContext = context.getApplicationContext();
            FacePassHandler.initSDK(mContext, "");

            // 1. Wait for FacePassHandler.isAvailable() to become true according to Megvii SDK docs (pp. 27-28)
            Log.d(TAG, "[CAM-AUTH-WAIT] Waiting for FacePassHandler.isAvailable() to be ready...");
            int retryAvailable = 0;
            while (!FacePassHandler.isAvailable() && retryAvailable < 30) {
                try {
                    Thread.sleep(200);
                } catch (InterruptedException ignored) {}
                retryAvailable++;
            }
            Log.d(TAG, "[CAM-AUTH-WAIT] FacePassHandler.isAvailable() status: " + FacePassHandler.isAvailable() + " (after " + (retryAvailable * 200) + "ms)");

            // 2. Check authorization status once SDK is available
            boolean authorized = FacePassHandler.isAuthorized();
            Log.d(TAG, "[CAM-AUTH-CHECK] FacePass.isAuthorized() = " + authorized);
            if (authorized) {
                Log.d(TAG, ">>> [CAM-AUTH-SUCCESS] ATSH204A Hardware Chipset License Valid & Active!");
                return true;
            }

            boolean authStatus = FacePassHandler.authCheck_algomall();
            Log.d(TAG, "[CAM-AUTH-CHECK] FacePass.authCheck_algomall() = " + authStatus);
            if (authStatus) {
                Log.d(TAG, ">>> [CAM-AUTH-SUCCESS] Algomall License Valid!");
                return true;
            }

            Log.d(TAG, "[CAM-AUTH-CHECK] Hardware Chip Authorization not valid yet. Checking cert file...");

            // 3. Fallback: Check certificate file in /sdcard/Download/
            String certDir = Environment.getExternalStorageDirectory().getAbsolutePath() + File.separator + "Download";
            File certFile = new File(certDir, CERT_FILENAME);
            Log.d(TAG, "[CAM-AUTH-CERT] Checking certificate file at: " + certFile.getAbsolutePath() + " (Exists: " + certFile.exists() + ")");

            String certContent = "";
            if (certFile.exists()) {
                certContent = readExternalCert(certFile);
            }

            if (!TextUtils.isEmpty(certContent)) {
                int ret = FacePassHandler.auth_algomall(certContent.trim());
                Log.d(TAG, "[CAM-AUTH-CERT] auth_algomall result ret_code: " + ret);
                boolean isSuccess = (ret == FacePassAuthCode.FP_AUTH_OK);
                if (isSuccess) {
                    Log.d(TAG, ">>> [CAM-AUTH-SUCCESS] Offline certificate authorization SUCCESSFUL!");
                } else {
                    Log.e(TAG, ">>> [CAM-AUTH-FAIL] Offline certificate authorization FAILED code: " + ret);
                }
                return isSuccess;
            } else {
                Log.w(TAG, "[CAM-AUTH-CERT] Cert file not found in /sdcard/Download!");
            }
        } catch (Exception e) {
            Log.e(TAG, ">>> [CAM-AUTH-ERROR] Exception initSDKAuth: " + e.getMessage(), e);
        }
        return false;
    }

    private static String readExternalCert(File file) {
        StringBuilder sb = new StringBuilder();
        try (FileInputStream inputStream = new FileInputStream(file)) {
            byte[] buffer = new byte[1024];
            int len;
            while ((len = inputStream.read(buffer)) > 0) {
                sb.append(new String(buffer, 0, len));
            }
        } catch (IOException e) {
            Log.e(TAG, "Error reading cert file: " + e.getMessage());
        }
        return sb.toString();
    }

    public static void init(Activity activity, IFacePassInit iFacePassInit) {
        if (mFacePassHandler != null) {
            Log.d(TAG, "[CAM-INIT] Handler already initialized, returning existing instance.");
            FacePassHelper.getInstance().startPeriodicFaceSync();
            iFacePassInit.result(mFacePassHandler);
            return;
        }

        new Thread(() -> {
            try {
                Context context = activity.getApplicationContext();
                Log.d(TAG, ">>> [CAM-INIT-START] Starting FacePass SDK initialization in background thread...");

                // 1. Authorize SDK
                boolean isAuth = initSDKAuth(context);

                if (!isAuth && !FacePassHandler.isAuthorized() && !FacePassHandler.authCheck_algomall()) {
                    Log.e(TAG, ">>> [CAM-INIT-ERROR] FacePass SDK Authorization FAILED! Device unauthorized & license invalid.");
                    iFacePassInit.result(null);
                    return;
                }

                // 2. Initialize Models
                Log.d(TAG, "[CAM-MODEL] Loading 8 AI binary models from assets...");
                FacePassConfig config = new FacePassConfig();
                config.poseBlurModel = FacePassModel.initModel(context.getAssets(), "attr.pose_blur.arm.190630.bin");
                config.livenessModel = FacePassModel.initModel(context.getAssets(), "liveness.CPU.rgb.G.bin");
                config.searchModel = FacePassModel.initModel(context.getAssets(), "feat2.arm.K.v1.0_1core.bin");
                config.detectModel = FacePassModel.initModel(context.getAssets(), "detector.arm.G.bin");
                config.detectRectModel = FacePassModel.initModel(context.getAssets(), "detector_rect.arm.G.bin");
                config.landmarkModel = FacePassModel.initModel(context.getAssets(), "pf.lmk.arm.E.bin");
                config.rcAttributeModel = FacePassModel.initModel(context.getAssets(), "attr.RC.arm.G.bin");
                config.occlusionFilterModel = FacePassModel.initModel(context.getAssets(), "attr.occlusion.arm.20201209.bin");

                config.rcAttributeAndOcclusionMode = 0;
                config.searchThreshold = 65f;
                config.livenessThreshold = 65f;
                config.livenessGaThreshold = 85f;
                config.livenessEnabled = true;
                config.rgbIrLivenessEnabled = false;

                config.poseThreshold = new FacePassPose(35f, 35f, 35f);
                config.blurThreshold = 0.8f;
                config.lowBrightnessThreshold = 70f;
                config.highBrightnessThreshold = 210f;
                config.brightnessSTDThreshold = 80f;
                config.faceMinThreshold = 0;
                config.detectMode = 2;
                config.retryCount = 8;
                config.smileEnabled = false;
                config.maxFaceEnabled = true;
                config.fileRootPath = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath();

                mFacePassHandler = new FacePassHandler();
                Log.d(TAG, "[CAM-INIT-BUILD] Building mFacePassHandler.initHandle(config)...");
                int ret = mFacePassHandler.initHandle(config);
                if (ret != 0) {
                    Log.e(TAG, ">>> [CAM-INIT-ERROR] Building FacePassHandler FAILED error_code: " + ret);
                    iFacePassInit.result(null);
                    return;
                }
                mFacePassHandler.setIRConfig(1.0, 0.0, 1.0, 0.0, 0.3);

                FacePassConfig addFaceConfig = mFacePassHandler.getAddFaceConfig();
                addFaceConfig.poseThreshold.pitch = 35f;
                addFaceConfig.poseThreshold.roll = 35f;
                addFaceConfig.poseThreshold.yaw = 35f;
                addFaceConfig.blurThreshold = 0.8f;
                addFaceConfig.lowBrightnessThreshold = 70f;
                addFaceConfig.highBrightnessThreshold = 210f;
                addFaceConfig.brightnessSTDThresholdLow = 10f;
                addFaceConfig.brightnessSTDThreshold = 80f;
                addFaceConfig.faceMinThreshold = 40;
                addFaceConfig.rcAttributeAndOcclusionMode = 0;
                mFacePassHandler.setAddFaceConfig(addFaceConfig);

                boolean containGroup = false;
                if (mFacePassHandler.getLocalGroups() != null) {
                    for (String g : mFacePassHandler.getLocalGroups()) {
                        if (GROUP_NAME.equals(g)) {
                            containGroup = true;
                            break;
                        }
                    }
                }
                if (!containGroup) {
                    mFacePassHandler.createLocalGroup(GROUP_NAME);
                    Log.d(TAG, "[CAM-GROUP] Local group " + GROUP_NAME + " created.");
                }
                mFacePassHandler.initLocalGroup(GROUP_NAME);

                Log.d(TAG, ">>> [CAM-INIT-SUCCESS] FacePass SDK Successfully Initialized Fully!");
                FacePassHelper.getInstance().startPeriodicFaceSync();
                iFacePassInit.result(mFacePassHandler);
            } catch (Exception e) {
                Log.e(TAG, ">>> [CAM-INIT-EXCEPTION] Exception in InitFacePassHandler: " + e.getMessage(), e);
                iFacePassInit.result(null);
            }
        }).start();
    }

    public static FacePassHandler getHandler() {
        return mFacePassHandler;
    }
}
