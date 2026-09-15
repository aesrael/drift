const { withAndroidManifest, withDangerousMod, withAppBuildGradle } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Android Auto plugin.
 * 1. Writes automotive_app_desc.xml
 * 2. Writes DriftMediaService.kt into the app source tree
 * 3. Adds uses-feature for automotive
 * 4. Adds com.google.android.gms.car.application meta-data
 * 5. Registers DriftMediaService with MediaBrowserService intent filter (sole AA entry point)
 * 6. Registers CarPlayService (harmless on Android, ready for future iOS work)
 * 7. Adds media3 dependencies to build.gradle
 */
const withAndroidAuto = (config) => {
  config = withAutomotiveXml(config);
  config = withDriftMediaServiceKt(config);
  config = withManifest(config);
  config = withMedia3Deps(config);
  return config;
};

// ── 1. automotive_app_desc.xml ───────────────────────────────────────────────

const withAutomotiveXml = (config) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'automotive_app_desc.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<automotiveApp>\n    <uses name="media"/>\n</automotiveApp>`,
        'utf-8'
      );
      return config;
    },
  ]);

// ── 2. DriftMediaService.kt ──────────────────────────────────────────────────

const withDriftMediaServiceKt = (config) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java/com/drift/app'
      );
      fs.mkdirSync(destDir, { recursive: true });

      const srcFile = path.join(config.modRequest.projectRoot, 'plugins/DriftMediaService.kt');
      const destFile = path.join(destDir, 'DriftMediaService.kt');
      const drawableDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
      fs.mkdirSync(drawableDir, { recursive: true });
      const fallback = path.join(config.modRequest.projectRoot, 'plugins/drift_disk_fallback.png');
      if (fs.existsSync(fallback)) fs.copyFileSync(fallback, path.join(drawableDir, 'drift_disk_fallback.png'));

      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
      } else {
        console.warn('[withAndroidAuto] DriftMediaService.kt not found at plugins/DriftMediaService.kt — skipping copy');
      }
      return config;
    },
  ]);

// ── 3 + 4 + 5 + 6. Manifest entries ─────────────────────────────────────────

const withManifest = (config) =>
  withAndroidManifest(config, async (config) => {
    const { manifest } = config.modResults;

    // uses-feature: automotive (optional)
    if (!manifest['uses-feature']) manifest['uses-feature'] = [];
    if (!manifest['uses-feature'].some((f) => f.$?.['android:name'] === 'android.hardware.type.automotive')) {
      manifest['uses-feature'].push({
        $: { 'android:name': 'android.hardware.type.automotive', 'android:required': 'false' },
      });
    }

    const app = manifest.application[0];
    if (!app['meta-data']) app['meta-data'] = [];
    if (!app.service) app.service = [];

    // Allow HTTP (cleartext) traffic — required for local Subsonic server
    app.$['android:usesCleartextTraffic'] = 'true';

    // meta-data: car application descriptor
    if (!app['meta-data'].some((m) => m.$?.['android:name'] === 'com.google.android.gms.car.application')) {
      app['meta-data'].push({
        $: {
          'android:name': 'com.google.android.gms.car.application',
          'android:resource': '@xml/automotive_app_desc',
        },
      });
    }

    // DriftMediaService — sole MediaBrowserService for Android Auto
    const driftName = 'com.drift.app.DriftMediaService';
    let driftSvc = app.service.find((s) => s.$?.['android:name'] === driftName);
    if (!driftSvc) {
      driftSvc = { $: { 'android:name': driftName } };
      app.service.push(driftSvc);
    }
    driftSvc.$ = {
      ...(driftSvc.$ || {}),
      'android:name': driftName,
      'android:foregroundServiceType': 'mediaPlayback',
      'android:exported': 'true',
    };
    if (!driftSvc['intent-filter']) driftSvc['intent-filter'] = [];
    const hasBrowserFilter = driftSvc['intent-filter'].some((f) =>
      (f.action || []).some((a) => a.$?.['android:name'] === 'android.media.browse.MediaBrowserService')
    );
    if (!hasBrowserFilter) {
      driftSvc['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.media.browse.MediaBrowserService' } }],
      });
    }

    // CarPlayService — androidx.car.app (Android Auto companion)
    const carName = 'org.birkir.carplay.CarPlayService';
    let carSvc = app.service.find((s) => s.$?.['android:name'] === carName);
    if (!carSvc) {
      carSvc = { $: { 'android:name': carName } };
      app.service.push(carSvc);
    }
    carSvc.$ = { ...(carSvc.$ || {}), 'android:name': carName, 'android:exported': 'true' };
    if (!carSvc['intent-filter']) carSvc['intent-filter'] = [];
    const hasCarFilter = carSvc['intent-filter'].some((f) =>
      (f.action || []).some((a) => a.$?.['android:name'] === 'androidx.car.app.CarAppService') &&
      (f.category || []).some((c) => c.$?.['android:name'] === 'androidx.car.app.category.AUDIO')
    );
    if (!hasCarFilter) {
      carSvc['intent-filter'].push({
        action: [{ $: { 'android:name': 'androidx.car.app.CarAppService' } }],
        category: [{ $: { 'android:name': 'androidx.car.app.category.AUDIO' } }],
      });
    }

    return config;
  });

// ── 7. media3 deps in build.gradle ──────────────────────────────────────────

const withMedia3Deps = (config) =>
  withAppBuildGradle(config, (config) => {
    const media3Deps = [
      `    implementation("androidx.media3:media3-exoplayer:1.3.1")`,
      `    implementation("androidx.media3:media3-session:1.3.1")`,
      `    implementation("androidx.media3:media3-common:1.3.1")`,
      `    implementation("androidx.media:media:1.7.0")`,
      `    implementation("androidx.car.app:app:1.4.0")`,
    ];

    let gradle = config.modResults.contents;

    // Only add each line if not already present
    let changed = false;
    for (const dep of media3Deps) {
      const depId = dep.trim().replace('implementation(', '').replace(')', '').replace(/"/g, '');
      if (!gradle.includes(depId)) {
        // Insert after the react-android line
        gradle = gradle.replace(
          /implementation\("com\.facebook\.react:react-android"\)/,
          `implementation("com.facebook.react:react-android")\n${dep}`
        );
        changed = true;
      }
    }

    config.modResults.contents = gradle;
    return config;
  });

module.exports = withAndroidAuto;
