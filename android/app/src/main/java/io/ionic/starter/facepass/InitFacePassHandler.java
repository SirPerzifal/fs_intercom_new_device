package io.ionic.starter.facepass;

import android.app.Activity;
import android.content.Context;
import android.os.Environment;
import android.text.TextUtils;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

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
        try {
            Context mContext = context.getApplicationContext();
            FacePassHandler.initSDK(mContext, "");
            if (FacePassHandler.isAuthorized()) {
                Log.d(TAG, "FacePass isAuthorized() == true");
                return true;
            }
            boolean authStatus = FacePassHandler.authCheck_algomall();
            if (authStatus) {
                Log.d(TAG, "FacePass authCheck_algomall() == true");
                return true;
            }

            // Single certification attempt using cert file in Download folder
            String certPath = Environment.getExternalStorageDirectory().getAbsolutePath() + File.separator + "Download" + File.separator + CERT_FILENAME;
            File certFile = new File(certPath);
            if (certFile.exists()) {
                String cert = readExternalCert(certFile);
                if (!TextUtils.isEmpty(cert)) {
                    int ret = FacePassHandler.auth_algomall(cert.trim());
                    Log.d(TAG, "FacePass auth_algomall result: " + ret);
                    return (ret == FacePassAuthCode.FP_AUTH_OK);
                }
            } else {
                Log.w(TAG, "Cert file not found at: " + certPath);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in initSDKAuth: " + e.getMessage(), e);
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
            iFacePassInit.result(mFacePassHandler);
            return;
        }

        new Thread(() -> {
            try {
                Context context = activity.getApplicationContext();

                // 1. Authorize SDK
                boolean isAuth = initSDKAuth(context);
                if (!isAuth && !FacePassHandler.isAuthorized()) {
                    Log.e(TAG, "FacePass SDK authorization failed");
                }

                // 2. Initialize Models
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
                int ret = mFacePassHandler.initHandle(config);
                if (ret != 0) {
                    Log.e(TAG, "Build FacePassHandler failed, error code: " + ret);
                    iFacePassInit.result(null);
                    return;
                }

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
                }
                mFacePassHandler.initLocalGroup(GROUP_NAME);

                Log.d(TAG, "FacePass SDK init success!");
                iFacePassInit.result(mFacePassHandler);
            } catch (Exception e) {
                Log.e(TAG, "Exception in InitFacePassHandler: " + e.getMessage(), e);
                iFacePassInit.result(null);
            }
        }).start();
    }

    public static FacePassHandler getHandler() {
        return mFacePassHandler;
    }
}
