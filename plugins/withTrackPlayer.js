const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Registers react-native-track-player's MusicService for phone-screen playback.
 * NOTE: MediaBrowserService intent filter is intentionally NOT added here —
 * DriftMediaService owns that filter exclusively so Android Auto connects to it.
 */
module.exports = function withTrackPlayer(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const { manifest } = androidManifest;

    // Permissions
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const permissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.WAKE_LOCK',
    ];
    permissions.forEach((permission) => {
      if (!manifest['uses-permission'].find((p) => p.$['android:name'] === permission)) {
        manifest['uses-permission'].push({ $: { 'android:name': permission } });
      }
    });

    // MusicService — no MediaBrowserService intent filter
    const application = manifest.application[0];
    if (!application.service) application.service = [];

    const serviceName = 'com.doublesymmetry.trackplayer.service.MusicService';
    let svc = application.service.find((s) => s?.$?.['android:name'] === serviceName);
    if (!svc) {
      svc = { $: { 'android:name': serviceName } };
      application.service.push(svc);
    }
    svc.$ = {
      ...(svc.$ || {}),
      'android:name': serviceName,
      'android:foregroundServiceType': 'mediaPlayback',
      'android:exported': 'true',
    };
    // Remove any MediaBrowserService intent filter if a previous build added it
    if (svc['intent-filter']) {
      svc['intent-filter'] = svc['intent-filter'].filter((intentFilter) =>
        !(intentFilter.action || []).some(
          (action) => action?.$?.['android:name'] === 'android.media.browse.MediaBrowserService'
        )
      );
      if (svc['intent-filter'].length === 0) delete svc['intent-filter'];
    }

    return config;
  });
};
