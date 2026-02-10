# Apple 로그인 vs 카카오/네이버/구글 – 설정 비교 및 확인

---

## 1. 근본적인 차이: .env에 넣는 게 왜 다를까?

| 구분 | 카카오 / 네이버 / 구글 | Apple (네이티브 iOS) |
|------|------------------------|----------------------|
| **방식** | OAuth 리다이렉트: 앱 → 포털 로그인 페이지 → 리다이렉트 URI로 돌아옴 | iOS 시스템 제공 “Sign in with Apple” 시트 → 앱이 **토큰만** 받음 |
| **.env 필요 여부** | ✅ 필요 (클라이언트 ID, 시크릿, 리다이렉트 URI 등) | ❌ **필요 없음** (네이티브 플로우에서는 리다이렉트/시크릿 없음) |
| **포털에서 할 일** | 앱 등록, 키 발급, 리다이렉트 URI 등록 | Apple Developer에서 **App ID에 Sign in with Apple capability**만 켜기 |
| **Firebase** | 각 포털 OAuth 설정 + Firebase에서 해당 제공업체 사용 설정 | Firebase Auth에서 **Apple 제공업체 “사용”**만 켜면 됨 (네이티브만 쓸 때) |

정리하면, **Apple 로그인은 카카오/네이버/구글처럼 “네이티브 앱 키, 클라이언트 시크릿, 리다이렉트 URI”를 .env에 넣는 구조가 아닙니다.**  
iOS는 시스템이 Apple ID로 인증하고 **identityToken**을 앱에 넘겨주고, 앱은 이 토큰을 Firebase `signInWithCredential`에 넘기기만 하면 됩니다.

---

## 2. Apple 로그인에 실제로 필요한 것 (체크리스트)

### 2.1 Apple Developer (developer.apple.com)

| 항목 | 설명 | 확인 |
|------|------|------|
| App ID | 앱 번들 ID (예: `com.jshyoun94.pocketspace`)로 App ID 생성 | ✅ 프로젝트에 사용 중 |
| Sign in with Apple | 해당 App ID에 **Sign in with Apple** capability 활성화 | ⬜ 콘솔에서 확인 필요 |

- [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → Identifiers → 해당 App ID → **Sign in with Apple** 체크 후 저장.

### 2.2 앱 빌드 (Xcode / Expo)

| 항목 | 설명 | 현재 프로젝트 |
|------|------|----------------|
| Capability | 타겟에 **Sign in with Apple** 추가 | ✅ `ios/PocketSpace/PocketSpace.entitlements`에 `com.apple.developer.applesignin` 존재 |
| 플러그인 | expo-apple-authentication | ✅ `app.config.ts` plugins에 포함 |

`npx expo prebuild --clean` 후에도 entitlements에 Sign in with Apple이 유지되는지 한 번 확인하는 것이 좋습니다.

### 2.3 Firebase Console

| 항목 | 설명 | 확인 |
|------|------|------|
| Apple 제공업체 | Authentication → Sign-in method → **Apple** → 사용 설정 | ⬜ 콘솔에서 확인 필요 |
| (선택) Service ID / Key | **웹**에서 Apple 로그인을 쓸 때만 필요. 네이티브 iOS만 쓰면 보통 비워 둬도 동작 | 필요 시 나중에 추가 |

- 네이티브만 사용하는 경우: Firebase에서 Apple을 “사용”으로 켜기만 하면 됨.  
- 로그인은 되는데 **Firebase 사용자로 안 만들어진다**면, Firebase Apple 설정에 Team ID / Key 등 추가가 필요할 수 있음 (아래 4절 참고).

### 2.4 .env

| 포털 | .env 항목 | Apple |
|------|-----------|--------|
| 카카오 | `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`, `EXPO_PUBLIC_KAKAO_REST_API_KEY` 등 | **없음** |
| 네이버 | `EXPO_PUBLIC_NAVER_CLIENT_ID`, `EXPO_PUBLIC_NAVER_CLIENT_SECRET`, `EXPO_PUBLIC_NAVER_REDIRECT_URI` | **없음** |
| 구글 | `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_REDIRECT_URI` 등 | **없음** |
| Apple | (네이티브 iOS) | **추가할 항목 없음** |

---

## 3. 현재 프로젝트에서 확인된 것

- ✅ `expo-apple-authentication` 설치 및 `app.config.ts` 플러그인 등록  
- ✅ `utils/authApple.ts`에서 Firebase `signInWithCredential(auth, credential)` 사용  
- ✅ `ios/PocketSpace/PocketSpace.entitlements`에 `com.apple.developer.applesignin` (Default)  
- ✅ `.env`에 Apple용 키/시크릿/리다이렉트 없음 → **의도된 상태** (네이티브는 불필요)  
- ⬜ Firebase Console에서 Apple 제공업체 “사용” 여부  
- ⬜ Apple Developer에서 해당 App ID에 Sign in with Apple 활성화 여부  

---

## 4. “로그인은 되는데 화면이 안 넘어간다”일 때 확인 순서

1. **Firebase에 사용자가 생기는지**  
   - Firebase Console → Authentication → Users  
   - Apple 로그인 버튼 탭 후 **새 사용자(Apple 제공업체)가 생성되는지** 확인  
   - **생성됨** → 인증은 정상. 문제는 앱 쪽 라우팅/약관·닉네임 플로우.  
   - **생성 안 됨** → Firebase가 Apple 토큰을 거부하는 것. 아래 2번 확인.

2. **Firebase Apple 설정**  
   - Authentication → Sign-in method → Apple  
   - “사용”이 켜져 있는지  
   - 네이티브만 쓰는 경우 보통 여기까지로 충분.  
   - 그래도 사용자가 안 만들어진다면, Firebase 문서에 따라 **Team ID, Service ID, Key** 등을 넣어야 할 수 있음 (주로 웹/서버 검증용이지만, 일부 환경에서는 네이티브에서도 요구할 수 있음).

3. **앱 로그**  
   - `signInWithCredential` 직후 에러가 나는지  
   - `auth.currentUser`가 null인지  
   - 콘솔에 `✅ Apple 로그인 & Firestore 저장 완료`가 찍히는지  
   - 찍힌다면 Firebase·Firestore까지는 성공한 것이고, 이후 `checkTermsAgreement` / `router.replace` 쪽을 의심.

4. **Apple Developer**  
   - 사용 중인 번들 ID의 App ID에 **Sign in with Apple**이 켜져 있지 않으면, 토큰이 유효하지 않아 Firebase가 거부할 수 있음.  
   - 위 2.1 확인.

---

## 5. "Users에 계정이 아예 안 생겨요"일 때 (Firebase가 토큰 거부)

**증상:** Apple 로그인 버튼 누르면 시트는 뜨고 완료까지 하는데, Firebase Authentication → Users에 새 사용자가 안 보임. (Firestore `users` 컬렉션에도 문서가 안 생김.)

→ **Firebase Auth가 Apple에서 받은 토큰을 검증하지 못하고 거부**하는 상태일 가능성이 큽니다.

### 5.1 앱에서 에러 확인

1. **Metro/터미널 로그**  
   Apple 로그인 실패 시 `[Apple 로그인] Firebase signInWithCredential 실패:` 로그가 찍힙니다.  
   - **code**: Firebase 에러 코드 (아래 표 참고)  
   - **message**: 상세 메시지  

2. **Toast**  
   실패 시 "Apple 로그인 실패" 아래에 `[에러코드] 메시지`가 뜹니다. 에러코드를 메모해 두세요.

### 5.2 자주 나오는 Firebase 에러와 대응

| code | 의미 | 확인할 것 |
|------|------|-----------|
| `auth/invalid-credential` + **"audience in ID Token [...] does not match the expected audience"** | Apple 토큰의 `aud`(번들 ID)와 Firebase가 기대하는 값이 다름 | **Firebase 프로젝트에 iOS 앱이 등록되어 있고, 번들 ID가 `com.jshyoun94.pocketspace`로 일치하는지** 확인 (아래 5.5절). |
| `auth/invalid-credential` (기타) | 토큰이 유효하지 않음 | Apple Developer에서 해당 App ID에 Sign in with Apple 켜져 있는지, 앱 번들 ID가 일치하는지 |
| `auth/configuration-not-found` | Apple 제공업체가 꺼져 있음 | Firebase Console → Authentication → Sign-in method → **Apple** → 사용 설정 켜기 |
| `auth/unauthorized-domain` | 도메인 미허용 | 웹만 해당. 네이티브 앱이면 해당 없음 |
| 기타 | | Firebase 문서 또는 콘솔 안내 참고 |

### 5.3 Firebase Console에서 꼭 확인할 것

1. **Authentication** → **Sign-in method** → **Apple**  
   - **사용 설정**이 **켜져** 있어야 함.  
   - 꺼져 있으면 `configuration-not-found` 또는 사용자 생성 자체가 안 됨.

2. **(선택) Apple 설정 추가**  
   - 네이티브만 쓰는 경우 "사용"만 켜도 되는 경우가 많지만, **토큰 거부가 계속되면** Firebase Apple 설정에 다음을 채워 보세요.  
   - **Apple Developer** → [Keys](https://developer.apple.com/account/resources/authkeys/list) → **+** → "Sign in with Apple" 체크 → Key 생성 후 **Key ID**와 **.p8 파일** 다운로드.  
   - **Certificates, Identifiers & Profiles** → **Identifiers** → **Services IDs**에서 서비스 ID 생성 후 Firebase 콘솔에 등록(웹용이지만, 일부 환경에서는 네이티브에서도 요구할 수 있음).  
   - Firebase → Apple 제공업체 설정에 **팀 ID**, **키 ID**, **.p8 내용(Private Key)** 등 입력.

3. **번들 ID 일치**  
   - Apple Developer의 App ID(번들 ID)와 앱의 **실제 번들 ID**(예: `com.jshyoun94.pocketspace`)가 **완전히 같아야** 합니다.

### 5.5 "audience does not match the expected audience" 해결 (iOS 앱 등록)

에러 메시지에 **"The audience in ID Token [com.jshyoun94.pocketspace] does not match the expected audience"** 가 나오면, Apple이 준 토큰의 audience는 번들 ID인데 **Firebase 쪽에 이 번들 ID로 등록된 iOS 앱이 없거나 다르게 되어 있을 때** 발생합니다.

**해결:**

1. [Firebase Console](https://console.firebase.google.com) → 프로젝트 선택  
2. 왼쪽 아래 **⚙️ 프로젝트 설정** 클릭  
3. **일반** 탭에서 아래로 내려가 **"내 앱"** 섹션 확인  
4. **iOS 앱**이 있는지 확인  
   - **없으면:** **"앱 추가"** → **iOS** 아이콘 선택 →  
     - **Apple 번들 ID**에 `com.jshyoun94.pocketspace` **정확히** 입력  
     - (앱 닉네임, App Store ID는 선택) → **앱 등록**  
   - **있는데 번들 ID가 다르면:** 해당 iOS 앱 옆 **⋮** → **설정** 등에서 번들 ID를 `com.jshyoun94.pocketspace`로 수정할 수 있는지 확인. 수정이 안 되면 기존 iOS 앱을 삭제하고 같은 번들 ID로 다시 추가  
5. **Authentication** → **Sign-in method** → **Apple** 이 **사용**으로 켜져 있는지 다시 확인  
6. 앱에서 Apple 로그인 다시 시도  

정리: **Firebase 프로젝트에 iOS 앱이 하나 이상 등록되어 있고, 그 앱의 번들 ID가 `com.jshyoun94.pocketspace`와 완전히 같아야** 이 에러가 사라집니다.

### 5.6 한 번 더 확인 순서

1. **Firebase 프로젝트 설정** → 내 앱 → **iOS 앱**이 있고 번들 ID가 `com.jshyoun94.pocketspace`인지 확인 (audience 에러일 때 필수)  
2. Firebase Console → Authentication → Sign-in method → **Apple 사용** 켜기  
3. Apple Developer → Identifiers → 해당 App ID → **Sign in with Apple** 체크  
4. 앱에서 Apple 로그인 다시 시도 → **실패 시 Toast / Metro 로그에 찍힌 에러 코드** 확인  
5. 위 표에서 해당 코드에 맞춰 설정 수정 후 재시도  

---

## 6. 요약

- **Apple 로그인은 카카오/네이버/구글처럼 “네이티브앱키, 클라이언트아이디, 리다이렉트URI, 클라이언트시크릿”을 .env에 넣는 구조가 아니다.**  
- **네이티브 iOS만 쓸 때:**  
  - Apple Developer: App ID에 Sign in with Apple 활성화  
  - 앱: entitlements + expo-apple-authentication (현재 적용됨)  
  - Firebase: Apple 제공업체 “사용”  
  - .env: Apple 전용 항목 없음  
- **Users에 계정이 아예 안 생기면:** Firebase가 Apple 토큰을 거부하는 것. 앱에서 실패 시 Toast/로그에 찍힌 **에러 코드** 확인 후, 위 5절 표와 Firebase Console(Apple 사용 설정) 확인.
- **화면이 안 넘어가면:** Firebase에 사용자 생성 여부 먼저 확인 → 생성되면 앱 라우팅/약관 플로우, 생성 안 되면 Firebase/Apple 설정 순으로 확인.
