package io.ionic.starter.plugin;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ActivityLauncher")
public class ActivityLauncher extends Plugin {

    @PluginMethod
    public void startActivity(PluginCall call) {
        String packageName = call.getString("packageName");
        String className = call.getString("className");

        if (packageName == null || className == null) {
            call.reject("Package name or class name is missing");
            return;
        }

        try {
            Intent intent = new Intent();
            intent.setClassName(packageName, className);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start activity: " + e.getMessage());
        }
    }
}
