# Sign in with Apple 설정

PocketSpace 앱의 Apple 로그인은 **iOS 전용**이며, 앱에서 Apple `identityToken`을 발급받은 뒤 **Cloud Functions `/auth/apple`**에서 JWT 검증 후 Firebase Custom Token을 발급하는 방식입니다.

---

## 1. Apple Developer Console

1. [Apple Developer](https://developer.apple.com) → **Certificates, Identifiers & Profiles** → **Identifiers**
2. 앱의 **App ID** 선택 (예: `com.jshyoun94.pocketspace`)
3. **Capabilities**에서 **Sign in with Apple** 체크 후 저장

(웹용으로 쓸 경우에만 별도 **Services ID** 생성 및 설정이 필요합니다. 네이티브 iOS만 쓸 경우 App ID만 있으면 됩니다.)

---

## 2. Xcode / iOS 프로젝트

- **Sign in with Apple** Capability가 프로젝트에 포함되어 있어야 합니다.
- Expo 빌드(예: `npx expo prebuild`) 시 `expo-apple-authentication` 플러그인이 해당 capability를 추가합니다.
- 네이티브 프로젝트를 직접 수정한 경우: Xcode → 타겟 → **Signing & Capabilities** → **+ Capability** → **Sign in with Apple** 추가.

---

## 3. 앱 코드 (클라이언트)

- **패키지**: `expo-apple-authentication`, `expo-crypto` (nonce용)
- **플로우**:
  1. `AppleAuthentication.signInAsync()`로 `identityToken`, `fullName`, `email` 수신
  2. `POST ${FUNCTIONS_ENDPOINT}/auth/apple` 로 `{ identityToken, email?, fullName? }` 전송
  3. 응답의 `customToken`으로 `signInWithCustomToken(auth, customToken)` 호출
  4. Firestore `users/{uid}` 에 `providers: ["apple"]`, 이름·이메일 등 merge

관련 파일:

- `components/AppleLoginButton.tsx` — 버튼 UI 및 `signInAsync` 호출
- `utils/authApple.ts` — `/auth/apple` 호출 후 Custom Token으로 로그인 및 Firestore 저장

---

## 4. Cloud Functions (백엔드)

- **엔드포인트**: `POST /auth/apple`
- **요청 body**: `{ identityToken: string, email?: string | null, fullName?: { givenName?, familyName? } | null }`
- **동작**:
  1. Apple 공개키(`https://appleid.apple.com/auth/keys`)로 `identityToken` JWT 검증
  2. `audience` = 앱 번들 ID (`com.jshyoun94.pocketspace`) 일치 확인
  3. `payload.sub`로 Firebase UID = `apple:{sub}` 생성/업데이트
  4. `admin.auth().createCustomToken(uid)` 발급 후 `{ customToken, profile }` 반환

Functions 쪽 상수:

- `APPLE_BUNDLE_ID`: `com.jshyoun94.pocketspace` (앱의 bundleIdentifier와 동일해야 함)

---

## 5. 환경 변수

| 위치 | 변수 | 설명 |
|------|------|------|
| 앱 | `EXPO_PUBLIC_FUNCTIONS_ENDPOINT` | Functions URL (예: `https://xxx.cloudfunctions.net/api`) |
| Functions | (없음) | Apple 공개키는 런타임에 `https://appleid.apple.com/auth/keys` 에서 조회 |

---

## 6. 동작 요약

- **iOS**: Apple 로그인 버튼 표시 → 탭 시 `signInAsync` → identityToken을 Functions로 전달 → Custom Token으로 Firebase 로그인 → Firestore `users` 문서 갱신
- **Android**: 버튼은 보이지만 탭 시 "Apple 로그인은 iOS 앱에서만 사용할 수 있습니다" 토스트 (코드에서 `Platform.OS === "ios"` 분기)

원래 문서가 Git에 커밋된 적이 없어 위 내용은 현재 코드 기준으로 재작성한 것입니다. 이전에 적어 두셨던 항목(예: 스크린샷, 별도 체크리스트)이 있으면 그에 맞춰 보완하시면 됩니다.
