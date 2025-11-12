// app.config.ts
import "dotenv/config";
import { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  // ✅ Kakao 네이티브 스킴 (env에 키가 없으면 kakao 스킴은 추가하지 않음)
  const kakaoNativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  const schemes: string[] = ["com.jshyoun94.pocketspace"];
  if (kakaoNativeAppKey) {
    schemes.push(`kakao${kakaoNativeAppKey}`);
  }

  // ✅ Android intentFilters (카카오 리다이렉트 처리용)
  const androidIntentFilters = kakaoNativeAppKey
    ? [
        {
          action: "VIEW",
          data: [
            {
              scheme: `kakao${kakaoNativeAppKey}`,
              host: "oauth",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ]
    : [];

  return {
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

    // ✅ 네이버/카카오 모두 커버: 앱 기본 스킴 + kakao{네이티브앱키}
    scheme: schemes,

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

        // ✅ Kakao 로그인에 필요한 iOS 쿼리 스킴 (카카오톡 앱 호출)
        LSApplicationQueriesSchemes: [
          "kakaokompassauth",
          "kakaolink",
          "kakaotalk",
          // 필요 시 추가: "kakaostory"
        ],
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
      // ✅ Kakao 리다이렉트 처리 (카카오톡 → 내 앱 복귀)
      intentFilters: androidIntentFilters,
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
          androidSpeechServicePackages: [
            "com.google.android.googlequicksearchbox",
          ],
        },
      ],
      // ✅ Kakao 네이티브 SDK 설정 플러그인 등록 (핵심!)
      [
        "@react-native-seoul/kakao-login",
        { kakaoAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY },
      ],
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      EXPO_PUBLIC_GOOGLE_PLACES_API_KEY:
        process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
      EXPO_PUBLIC_NAVER_CLIENT_ID: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
      EXPO_PUBLIC_NAVER_CLIENT_SECRET:
        process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET,
      EXPO_PUBLIC_NAVER_REDIRECT_URI:
        process.env.EXPO_PUBLIC_NAVER_REDIRECT_URI,

      // ✅ Kakao: 네이티브용 키 사용 (REST 키와 구분!)
      EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY:
        process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,

      EXPO_PUBLIC_KAKAO_REST_API_KEY:
        process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
      EXPO_PUBLIC_KAKAO_REDIRECT_URI:
        process.env.EXPO_PUBLIC_KAKAO_REDIRECT_URI,
    },
  };
};
