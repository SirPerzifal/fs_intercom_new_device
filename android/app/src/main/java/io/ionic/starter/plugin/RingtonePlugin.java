package io.ionic.starter.plugin;

import android.content.Context;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Ringtone")
public class RingtonePlugin extends Plugin {

    private Ringtone ringtone;
    private MediaPlayer mediaPlayer;
    private AudioManager audioManager;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private void releaseMediaPlayer() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
            } catch (Exception ignored) {}
            try {
                mediaPlayer.reset();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
    }

    private void releaseRingtone() {
        if (ringtone != null) {
            try {
                if (ringtone.isPlaying()) {
                    ringtone.stop();
                }
            } catch (Exception ignored) {}
            ringtone = null;
        }
    }

    @PluginMethod
    public void playOutgoing(PluginCall call) {
        Log.d("RingtonePlugin", "playOutgoing() dipanggil");

        Context context = getContext();
        int resID = context.getResources().getIdentifier("outgoing_call", "raw", context.getPackageName());

        if (resID == 0) {
            call.reject("Audio resource not found");
            return;
        }

        releaseMediaPlayer();

        try {
            mediaPlayer = MediaPlayer.create(context, resID);
            if (mediaPlayer != null) {
                mediaPlayer.setLooping(true);
                mediaPlayer.start();
                call.resolve();
            } else {
                call.reject("MediaPlayer gagal dibuat");
            }
        } catch (Exception e) {
            Log.e("RingtonePlugin", "Error creating MediaPlayer: " + e.getMessage());
            call.reject("Error creating MediaPlayer: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopOutgoing(PluginCall call) {
        Log.d("RingtonePlugin", "stopOutgoing() dipanggil");
        releaseMediaPlayer();
        call.resolve();
    }

    @PluginMethod
    public void setSpeakerOn(PluginCall call) {
        Log.d("RingtonePlugin", "set speaker on");
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setSpeakerphoneOn(true);
            call.resolve();
        } else {
            call.reject("AudioManager not available");
        }
    }

    @PluginMethod
    public void setEarpieceOn(PluginCall call) {
        Log.d("RingtonePlugin", "set earpiece on");
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setSpeakerphoneOn(false);
            call.resolve();
        } else {
            call.reject("AudioManager not available");
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        Log.d("RingtonePlugin", "play() dipanggil");
        Context context = getContext();
        Uri notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        releaseRingtone();
        ringtone = RingtoneManager.getRingtone(context, notification);
        if (ringtone != null && !ringtone.isPlaying()) {
            ringtone.play();
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Log.d("RingtonePlugin", "stop() dipanggil");
        releaseRingtone();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        releaseMediaPlayer();
        releaseRingtone();
        super.handleOnDestroy();
    }
}
