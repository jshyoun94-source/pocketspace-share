// app.config.ts
import "dotenv/config";
import { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "PocketSpace",
  slug: "pocketspace",
  version: "1.0.0",

  orientation: "portrait",
  userInterfaceStyle: "light",

  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },

  assetBundlePatterns: ["**/*"],

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.jsh.pocketspace",
    infoPlist: {
      NSSpeechRecognitionUsageDescription:
        "PocketSpace가 음성 인식 기능을 사용하도록 허용하시겠습니까?",
      NSMicrophoneUsageDescription:
        "PocketSpace가 마이크에 접근하도록 허용하시겠습니까?",
    },
  },

  android: {
    package: "com.jsh.pocketspace",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.INTERNET",
    ],
  },

  web: {
    favicon: "./assets/favicon.png",
  },

  // ✅ 음성 인식 플러그인 등록
  plugins: [
    [
      "expo-speech-recognition",
      {
        microphonePermission: "PocketSpace가 마이크에 접근하도록 허용하시겠습니까?",
        speechRecognitionPermission:
          "PocketSpace가 음성 인식 기능을 사용하도록 허용하시겠습니까?",
        androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"],
      },
    ],
  ],

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
