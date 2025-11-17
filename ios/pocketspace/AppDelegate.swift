// ios/PocketSpace/AppDelegate.swift
import UIKit

// Expo / RN (네가 쓰는 새 템플릿 스타일 유지)
import Expo
import React
import ReactAppDependencyProvider

// ✅ Kakao iOS SDK
import KakaoSDKCommon

// ✅ RN Kakao Login 네이티브 모듈 (URL 핸들링용)
import kakao_login

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {

    // ✅ Kakao SDK 초기화
    //   - 우선 Info.plist에 주입된 키(플러그인에서 넣어줌)를 찾고,
    //   - 없으면 .env에서 노출된 런타임 환경변수로 대체
    let plistKey = Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String
    let envKey = ProcessInfo.processInfo.environment["EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY"]
    let kakaoKey = (plistKey?.isEmpty == false ? plistKey : envKey) ?? ""

    if !kakaoKey.isEmpty {
      KakaoSDK.initSDK(appKey: kakaoKey)
      print("✅ KakaoSDK.initSDK with key:", kakaoKey)
    } else {
      print("⚠️ KAKAO_NATIVE_APP_KEY / EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY not found")
    }

    // ===== Expo/RN 부팅 =====
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions
    )
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // ✅ URL 스킴 핸들링 (카카오톡 → 내 앱 복귀)
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    // 카카오톡 로그인 콜백이면 먼저 처리
    if kakao_login.RNKakaoLogins.isKakaoTalkLoginUrl(url) {
      return kakao_login.RNKakaoLogins.handleOpen(url)
    }
    // 그 외 링크는 RN Linking으로
    return super.application(app, open: url, options: options)
      || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings()
      .jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
