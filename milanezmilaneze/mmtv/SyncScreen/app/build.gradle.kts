plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.syncscreen"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.example.syncscreen"
        minSdk = 21
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        // ⚠️ ALTERE para o IP do servidor na sua rede local antes de compilar
        buildConfigField("String", "SERVER_URL", "\"http://192.168.13.128:3000\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.leanback)
    implementation(libs.glide)
}
