// app.config.ts
import "dotenv/config";
import { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  name: "PocketSpace",
  slug: "pocketspace",
  version: "1.0.0",

  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,

  icon: "./assets/images/icon.png",
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },

  assetBundlePatterns: ["**/*"],

  // ✅ 네이버 콘솔에 등록한 URL Scheme와 동일
  scheme: "com.jshyoun94.pocketspace",

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.jshyoun94.pocketspace",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "지도를 표시하고 내 주변 공간을 찾기 위해 위치 접근 권한이 필요합니다.",
      NSPhotoLibraryUsageDescription:
        "공간 등록을 위해 사진 앨범 접근 권한이 필요합니다.",
      NSPhotoLibraryAddUsageDescription:
        "공간 사진을 앨범에 저장하기 위해 사진 추가 권한이 필요합니다.",
      NSCameraUsageDescription:
        "공간 등록 시 사진 촬영을 위해 카메라 접근 권한이 필요합니다.",
      NSMicrophoneUsageDescription:
        "PocketSpace가 마이크에 접근하도록 허용하시겠습니까?",
      NSSpeechRecognitionUsageDescription:
        "PocketSpace가 음성 인식 기능을 사용하도록 허용하시겠습니까?",
      // 필요 시 Always 권한도 사용 가능
      // NSLocationAlwaysAndWhenInUseUsageDescription:
      //   "백그라운드에서도 위치를 사용하여 서비스를 제공합니다.",
    },
  },

  android: {
    package: "com.jshyoun94.pocketspace",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.RECORD_AUDIO",
      "android.permission.INTERNET",
    ],
  },

  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },

  plugins: [
    "expo-router",
    "expo-location",
    "expo-image-picker",
    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "PocketSpace가 마이크에 접근하도록 허용하시겠습니까?",
        speechRecognitionPermission:
          "PocketSpace가 음성 인식 기능을 사용하도록 허용하시겠습니까?",
        androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"],
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    EXPO_PUBLIC_GOOGLE_PLACES_API_KEY:
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
    EXPO_PUBLIC_NAVER_CLIENT_ID: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
    EXPO_PUBLIC_NAVER_CLIENT_SECRET: process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET,
    EXPO_PUBLIC_NAVER_REDIRECT_URI: process.env.EXPO_PUBLIC_NAVER_REDIRECT_URI,
    EXPO_PUBLIC_KAKAO_REST_API_KEY: process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
    EXPO_PUBLIC_KAKAO_REDIRECT_URI: process.env.EXPO_PUBLIC_KAKAO_REDIRECT_URI,
  },
});
