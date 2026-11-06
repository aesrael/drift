plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinAndroid)
    alias(libs.plugins.composeCompiler)
}

android {
    namespace = "com.drift.app"
    compileSdk = 36
    defaultConfig {
        // Same id as the React Native build so this installs over it (same signing key required).
        applicationId = "com.drift.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 100
        versionName = "2.0.0"
    }
    // An unsigned release APK is what makes Android answer "App not installed". Release is now always signed:
    // with your own keystore if you provide one (gradle.properties / env: DRIFT_KEYSTORE, DRIFT_KEYSTORE_PASSWORD,
    // DRIFT_KEY_ALIAS, DRIFT_KEY_PASSWORD), otherwise with the debug key so the APK installs out of the box.
    // NOTE: to update over your existing React Native install the signature must match that app's key; otherwise uninstall it first.
    val ksPath = (findProperty("DRIFT_KEYSTORE") as String?) ?: System.getenv("DRIFT_KEYSTORE")
    signingConfigs {
        if (ksPath != null && file(ksPath).exists()) create("drift") {
            storeFile = file(ksPath)
            storePassword = (findProperty("DRIFT_KEYSTORE_PASSWORD") as String?) ?: System.getenv("DRIFT_KEYSTORE_PASSWORD")
            keyAlias = (findProperty("DRIFT_KEY_ALIAS") as String?) ?: System.getenv("DRIFT_KEY_ALIAS")
            keyPassword = (findProperty("DRIFT_KEY_PASSWORD") as String?) ?: System.getenv("DRIFT_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("drift") ?: signingConfigs.getByName("debug")
            // Minify off for now: ktor / serialization / media3 need keep-rules that can only be tuned once it builds.
            isMinifyEnabled = false
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.media3.session)
}
