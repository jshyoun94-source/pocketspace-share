# iOS 빌드 실패 (xcodebuild exit code 65) 해결

---

## 0. RCTPackagerConnection / CoreAudioTypes / SwiftUICore 에러인 경우

**원인:** New Architecture + expo-dev-client 조합에서 발생하는 링커 오류.

**조치:** New Architecture를 끄고 클린 빌드.

1. `app.config.ts` 에서 `newArchEnabled: false` 인지 확인 (이미 적용됨).
2. 아래 순서대로 실행:

```bash
cd /Users/jsh/pocketspace-cursor/pocketspace-share
rm -rf ios/build
cd ios
pod deintegrate
pod install
cd ..
npx expo run:ios
```

또는 **Xcode**에서:  
Product → Clean Build Folder (Shift+Cmd+K) 후 Product → Build (Cmd+B).

---

## 1. 실제 에러 메시지 확인

터미널에서 **전체 로그**를 보려면:

```bash
cd /Users/jsh/pocketspace-cursor/pocketspace-share
npx expo run:ios 2>&1 | tee build.log
```

끝까지 실행한 뒤 `build.log`를 열어 **맨 아래쪽의 빨간 에러 문구**를 확인하세요.

또는 **Xcode에서 빌드**하면 에러가 더 잘 보입니다:

1. Xcode에서 **`ios/PocketSpace.xcworkspace`** 열기 (`.xcworkspace` 필수)
2. 상단 메뉴 **Product → Clean Build Folder** (Shift+Cmd+K)
3. **Product → Build** (Cmd+B)
4. 왼쪽 **Report navigator** (⌘9) → 맨 위 빌드 선택 → **에러/경고** 클릭해 내용 확인

---

## 2. 자주 쓰는 해결 방법

### A. Pod 재설치

```bash
cd ios
pod install
cd ..
npx expo run:ios
```

### B. Xcode에서 Sign in with Apple Capability 확인

1. Xcode → 프로젝트 **PocketSpace** 선택
2. **Signing & Capabilities** 탭
3. **Sign in with Apple**이 있고 체크되어 있는지 확인
4. **Signing**에서 팀(Team) 선택, **Automatically manage signing** 체크

### C. 빌드 캐시 정리 후 재빌드

```bash
cd ios
xcodebuild clean -workspace PocketSpace.xcworkspace -scheme PocketSpace
pod install
cd ..
npx expo run:ios
```

### D. node_modules·캐시 전부 정리 후 재설치

```bash
rm -rf node_modules ios/build ios/Pods ios/Podfile.lock
npm install
cd ios && pod install && cd ..
npx expo run:ios
```

---

## 3. 에러 유형별로 보기

| 에러 키워드 | 대응 |
|-------------|------|
| `Signing for ... requires a development team` | Xcode → Signing & Capabilities에서 Team 선택 |
| `No such module 'ExpoAppleAuthentication'` | `cd ios && pod install` 후 다시 빌드 |
| `Duplicate symbol` | `use_frameworks! :linkage => :static` 등 Podfile 설정 충돌 가능성 |
| `Command PhaseScriptExecution failed` | Build Phases 안의 Run Script 단계 실패 → 해당 스크립트 로그 확인 |

---

**다음 단계:** 위 1번으로 **정확한 에러 문구 한 줄**를 확인한 뒤, 그 내용을 알려주시면 원인에 맞춰 더 짧게 안내할 수 있습니다.
