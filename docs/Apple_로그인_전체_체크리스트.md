# Apple 로그인 – 전반 검토 및 체크리스트

Apple 로그인 오류 시 **코드·Firebase·Apple Developer**를 순서대로 점검할 수 있도록 정리한 문서입니다.

---

## 1. 앱 코드 흐름 (검토 완료)

| 단계 | 파일 | 내용 |
|------|------|------|
| 1 | `AppleLoginButton.tsx` | `Crypto.randomUUID()`로 raw nonce 생성 → `sha256Nonce(rawNonce)`로 해시 → Apple `signInAsync({ nonce: hashedNonce })` |
| 2 | `authApple.ts` | `sha256Nonce`: **js-sha256**로 UTF-8 문자열 SHA256 → base64url (Firebase와 동일 형식) |
| 3 | `authApple.ts` | `signInWithAppleCredential(identityToken, rawNonce, ...)` → Firebase `credential({ idToken, rawNonce })` → `signInWithCredential(auth, credential)` |
| 4 | `login.tsx` | `onSuccess` → `checkTermsAgreement("apple")` → 약관/닉네임 후 `router.replace("/(tabs)")` |

**nonce:** Apple에는 **해시된 nonce**(SHA256 후 base64url)를 보내고, Firebase에는 **raw nonce**만 넘깁니다. Firebase가 raw를 해시해 토큰의 nonce와 비교하므로, 해시 구현을 **js-sha256**(UTF-8 기준)으로 통일해 두었습니다.

---

## 2. 당신이 체크할 곳 (순서대로)

### A. Firebase Console

1. **프로젝트 설정**
   - [Firebase Console](https://console.firebase.google.com) → 프로젝트 **tangential-sled-352810** 선택
   - ⚙️ **프로젝트 설정** → **일반** 탭
   - **내 앱**에서 **iOS 앱**이 있는지 확인
   - **번들 ID**가 **`com.jshyoun94.pocketspace`** 인지 확인 (다르면 audience 오류 가능)

2. **Authentication – Apple 사용**
   - **Authentication** → **Sign-in method**
   - **Apple** 행에서 **사용 설정**이 **켜져** 있는지 확인
   - (선택) OAuth 코드 흐름·서비스 ID는 **비워 두어도** 됨 (네이티브 iOS만 쓸 때)

3. **GoogleService-Info.plist**
   - iOS 앱 상세에서 **GoogleService-Info.plist** 다운로드 링크가 있는지 확인
   - 이미 `ios/PocketSpace/GoogleService-Info.plist`에 넣었다면, **같은 프로젝트**에서 받은 파일인지 확인

---

### B. Apple Developer

1. **App ID – Sign in with Apple**
   - [developer.apple.com](https://developer.apple.com) → **Account** → **Certificates, Identifiers & Profiles**
   - **Identifiers** → 앱의 **App ID** 선택 (예: `com.jshyoun94.pocketspace`)
   - **Sign in with Apple**이 **체크**되어 있는지 확인
   - **Edit** → "Enable as a primary App ID" 선택 후 **저장**

2. **번들 ID 일치**
   - 위 App ID의 **Bundle ID**와
   - Xcode/Expo 앱의 **번들 ID** (`app.config.ts`의 `ios.bundleIdentifier`)
   - 가 **완전히 동일**한지 확인

---

### C. 로컬 프로젝트

1. **의존성 설치**
   ```bash
   cd /Users/jsh/pocketspace-cursor/pocketspace-share
   npm install
   ```
   - `js-sha256`가 설치되어 있어야 nonce 해시가 Firebase와 맞습니다.

2. **실행 방식**
   - **Metro 기준 실행** 권장: `npx expo start` → 터미널에서 **`i`** (iOS)
   - 이렇게 해야 최신 JS(수정한 nonce 로직)가 반영됩니다.

3. **iOS 네이티브**
   - 실제 **iOS 시뮬레이터 또는 기기**에서 테스트 (Apple 로그인은 iOS 전용)
   - `ios/PocketSpace/GoogleService-Info.plist` 존재 여부
   - Xcode에서 **Sign in with Apple** capability 포함 여부 (`PocketSpace.entitlements`)

---

## 3. 자주 나오는 에러와 확인 위치

| 에러 | 의미 | 체크할 곳 |
|------|------|-----------|
| `auth/invalid-credential` + **audience does not match** | 토큰의 audience(번들 ID)와 Firebase 기대값 불일치 | **2-A.1** – Firebase에 iOS 앱 등록·번들 ID `com.jshyoun94.pocketspace` |
| `auth/missing-or-invalid-nonce` | 토큰의 nonce와 Firebase가 raw nonce로 계산한 해시 불일치 | **코드** – `utils/authApple.ts`에서 **js-sha256** 사용 여부, **2-C.1** npm install |
| `auth/configuration-not-found` | Apple 제공업체 미사용 | **2-A.2** – Authentication → Apple 사용 설정 |
| Apple 로그인 버튼이 안 보임 | iOS가 아님 / capability 없음 / Metro 안 켬 | **2-C.2, 2-C.3** – iOS에서 실행, Metro로 실행, capability 확인 |

---

## 4. 한 번에 확인하는 순서 (요약)

1. **Firebase** – iOS 앱 등록·번들 ID, Apple 사용 설정  
2. **Apple Developer** – App ID에 Sign in with Apple 체크, 번들 ID 일치  
3. **로컬** – `npm install` → `npx expo start` → `i` 로 iOS 실행  
4. **에러 메시지** – 위 표에서 해당 코드에 맞는 항목만 다시 점검  

위 순서대로 체크한 뒤에도 같은 오류가 나오면, **에러 메시지 전문**과 **어디까지 확인했는지** 알려주면 다음 단계 짚어줄 수 있습니다.
