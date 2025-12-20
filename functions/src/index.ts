// functions/src/index.ts
import cors from "cors";
import express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  // Functions 기본 서비스 계정 사용
  admin.initializeApp();
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/**
 * POST /auth/naver
 * body: { accessToken: string }
 * 1) 네이버 토큰으로 프로필 조회
 * 2) Firebase 커스텀 토큰 발급
 * 3) { customToken, profile } 반환
 */
app.post("/auth/naver", async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken required" });
    }

    const r = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: any = await r.json();

    if (!data || data.resultcode !== "00" || !data.response?.id) {
      console.error("NAVER token invalid:", data);
      return res.status(401).json({ error: "NAVER token invalid", raw: data });
    }

    const profile = data.response; // { id, email?, name?, profile_image? ... }
    const naverId = profile.id;
    const email: string | null = profile.email ?? null;

    // 2) Firebase uid 결정 로직 (카카오와 동일)
    //    - 이메일이 이미 있는 유저면 그 uid 사용
    //    - 아니면 naver:<id> 로 새 uid 사용
    let uid = `naver:${naverId}`;

    if (email) {
      try {
        const existingUser = await admin.auth().getUserByEmail(email);
        // 이미 다른 provider로 가입된 계정이 있으면 그 uid 재사용
        uid = existingUser.uid;
      } catch (err: any) {
        if (err.code !== "auth/user-not-found") {
          // 다른 에러는 그대로 throw 해서 잡히게
          throw err;
        }
        // user-not-found 면 그냥 naver:<id> 사용
      }
    }

    // 3) 해당 uid의 유저 정보 업데이트 또는 생성
    await admin
      .auth()
      .updateUser(uid, {
        email: email || undefined,
        displayName: profile.name || undefined,
        photoURL: profile.profile_image || undefined,
      })
      .catch(async (err) => {
        if (err.code === "auth/user-not-found") {
          await admin.auth().createUser({
            uid,
            email: email || undefined,
            displayName: profile.name || undefined,
            photoURL: profile.profile_image || undefined,
          });
        } else {
          throw err;
        }
      });

    // 4) 커스텀 토큰 발급
    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "naver",
      email,
    });

    return res.json({ customToken, profile });
  } catch (e: any) {
    console.error("NAVER auth error:", e);
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});

/**
 * POST /auth/kakao
 * body: { accessToken: string }
 * 1) 카카오 토큰으로 유저 정보 조회
 * 2) Firebase 유저 생성/업데이트 + 커스텀 토큰 발급
 * 3) { customToken, profile } 반환
 */
app.post("/auth/kakao", async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken required" });
    }

    // 1) 카카오 유저 정보 조회
    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const meData: any = await meRes.json();

    if (!meRes.ok || !meData?.id) {
      console.error("KAKAO token invalid:", meData);
      return res.status(401).json({ error: "KAKAO token invalid", raw: meData });
    }

    const kakaoId: number = meData.id;
    const kakaoAccount = meData.kakao_account ?? {};
    const kakaoProfile = kakaoAccount.profile ?? {};

    const email: string | null = kakaoAccount.email ?? null;
    const nickname: string | null = kakaoProfile.nickname ?? null;
    const profileImageUrl: string | null =
      kakaoProfile.profile_image_url ?? null;

    // 2) Firebase uid 결정 로직
    //    - 이메일이 이미 있는 유저면 그 uid 사용
    //    - 아니면 kakao:<id> 로 새 uid 사용
    let uid = `kakao:${kakaoId}`;

    if (email) {
      try {
        const existingUser = await admin.auth().getUserByEmail(email);
        // 이미 다른 provider로 가입된 계정이 있으면 그 uid 재사용
        uid = existingUser.uid;
      } catch (err: any) {
        if (err.code !== "auth/user-not-found") {
          // 다른 에러는 그대로 throw 해서 잡히게
          throw err;
        }
        // user-not-found 면 그냥 kakao:<id> 사용
      }
    }

    // 3) 해당 uid의 유저 정보 업데이트 또는 생성
    await admin
      .auth()
      .updateUser(uid, {
        email: email || undefined,
        displayName: nickname || undefined,
        photoURL: profileImageUrl || undefined,
      })
      .catch(async (err) => {
        if (err.code === "auth/user-not-found") {
          await admin.auth().createUser({
            uid,
            email: email || undefined,
            displayName: nickname || undefined,
            photoURL: profileImageUrl || undefined,
          });
        } else {
          throw err;
        }
      });

    // 4) 커스텀 토큰 발급
    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "kakao",
      email,
    });

    const profile = {
      id: kakaoId,
      email,
      nickname,
      profileImageUrl,
    };

    return res.json({ customToken, profile });
  } catch (e: any) {
    console.error("KAKAO auth error:", e);
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});

/**
 * POST /auth/google/code
 * body: { code: string, redirectUri: string, state: string }
 * 1) 구글 code를 accessToken으로 교환
 * 2) accessToken으로 유저 정보 조회
 * 3) Firebase 유저 생성/업데이트 + 커스텀 토큰 발급
 * 4) { accessToken, customToken, profile } 반환
 */
app.post("/auth/google/code", async (req, res) => {
  try {
    const { code, redirectUri, codeVerifier } = req.body || {};
    if (!code) {
      return res.status(400).json({ error: "code required" });
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("GOOGLE_CLIENT_ID 또는 GOOGLE_CLIENT_SECRET이 설정되지 않았습니다.");
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID 또는 GOOGLE_CLIENT_SECRET이 설정되지 않았습니다." });
    }

    // 1) code를 accessToken으로 교환 (PKCE code_verifier 포함)
    const tokenParams = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri || "https://auth.expo.io/@jshyoun94-source/pocketspace",
      grant_type: "authorization_code",
      ...(codeVerifier && { code_verifier: codeVerifier }), // PKCE code_verifier 추가
    });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("GOOGLE code 교환 실패:", tokenData);
      return res.status(401).json({ error: "GOOGLE code 교환 실패", raw: tokenData });
    }

    const accessToken = tokenData.access_token;

    // 2) accessToken으로 유저 정보 조회
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userInfo: any = await userInfoRes.json();

    if (!userInfoRes.ok || !userInfo?.sub) {
      console.error("GOOGLE token invalid:", userInfo);
      return res.status(401).json({ error: "GOOGLE token invalid", raw: userInfo });
    }

    const googleId: string = userInfo.sub;
    const email: string | null = userInfo.email ?? null;
    const name: string | null = userInfo.name ?? null;
    const picture: string | null = userInfo.picture ?? null;

    // 3) Firebase uid 결정 로직 (네이버/카카오와 동일)
    let uid = `google:${googleId}`;

    if (email) {
      try {
        const existingUser = await admin.auth().getUserByEmail(email);
        uid = existingUser.uid;
      } catch (err: any) {
        if (err.code !== "auth/user-not-found") {
          throw err;
        }
      }
    }

    // 4) 해당 uid의 유저 정보 업데이트 또는 생성
    await admin
      .auth()
      .updateUser(uid, {
        email: email || undefined,
        displayName: name || undefined,
        photoURL: picture || undefined,
      })
      .catch(async (err) => {
        if (err.code === "auth/user-not-found") {
          await admin.auth().createUser({
            uid,
            email: email || undefined,
            displayName: name || undefined,
            photoURL: picture || undefined,
          });
        } else {
          throw err;
        }
      });

    // 5) 커스텀 토큰 발급
    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "google",
      email,
    });

    const profile = {
      id: googleId,
      email,
      name,
      picture,
    };

    return res.json({ accessToken, customToken, profile });
  } catch (e: any) {
    console.error("GOOGLE code auth error:", e);
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});

/**
 * POST /auth/google
 * body: { accessToken: string }
 * 1) 구글 토큰으로 유저 정보 조회
 * 2) Firebase 유저 생성/업데이트 + 커스텀 토큰 발급
 * 3) { customToken, profile } 반환
 */
app.post("/auth/google", async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken required" });
    }

    // 1) 구글 유저 정보 조회
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userInfo: any = await userInfoRes.json();

    if (!userInfoRes.ok || !userInfo?.sub) {
      console.error("GOOGLE token invalid:", userInfo);
      return res.status(401).json({ error: "GOOGLE token invalid", raw: userInfo });
    }

    const googleId: string = userInfo.sub;
    const email: string | null = userInfo.email ?? null;
    const name: string | null = userInfo.name ?? null;
    const picture: string | null = userInfo.picture ?? null;

    // 2) Firebase uid 결정 로직 (네이버/카카오와 동일)
    //    - 이메일이 이미 있는 유저면 그 uid 사용
    //    - 아니면 google:<id> 로 새 uid 사용
    let uid = `google:${googleId}`;

    if (email) {
      try {
        const existingUser = await admin.auth().getUserByEmail(email);
        // 이미 다른 provider로 가입된 계정이 있으면 그 uid 재사용
        uid = existingUser.uid;
      } catch (err: any) {
        if (err.code !== "auth/user-not-found") {
          // 다른 에러는 그대로 throw 해서 잡히게
          throw err;
        }
        // user-not-found 면 그냥 google:<id> 사용
      }
    }

    // 3) 해당 uid의 유저 정보 업데이트 또는 생성
    await admin
      .auth()
      .updateUser(uid, {
        email: email || undefined,
        displayName: name || undefined,
        photoURL: picture || undefined,
      })
      .catch(async (err) => {
        if (err.code === "auth/user-not-found") {
          await admin.auth().createUser({
            uid,
            email: email || undefined,
            displayName: name || undefined,
            photoURL: picture || undefined,
          });
        } else {
          throw err;
        }
      });

    // 4) 커스텀 토큰 발급
    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "google",
      email,
    });

    const profile = {
      id: googleId,
      email,
      name,
      picture,
    };

    return res.json({ customToken, profile });
  } catch (e: any) {
    console.error("GOOGLE auth error:", e);
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});

/**
 * GET / (테스트용)
 */
app.get("/", (req, res) => {
  res.json({ message: "Firebase Functions API is running", timestamp: new Date().toISOString() });
});

/**
 * GET /auth/google/callback
 * Google OAuth 리디렉션 핸들러
 * code를 받아서 앱으로 리디렉션하는 HTML 페이지 반환
 */
app.get("/auth/google/callback", async (req, res) => {
  try {
    console.log("🔍 Google callback 호출됨:", req.query);
    const { code, state, error } = req.query;

    if (error) {
      // 에러가 있으면 앱으로 에러 전달
      const errorUri = `com.jshyoun94.pocketspace://google-auth?error=${encodeURIComponent(
        String(error)
      )}`;
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>로그인 처리 중...</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <script>
              window.location.href = "${errorUri}";
            </script>
            <p>앱으로 리디렉션 중...</p>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send("code가 없습니다.");
    }

    // code와 state를 앱으로 전달
    const redirectUri = `com.jshyoun94.pocketspace://google-auth?code=${encodeURIComponent(
      String(code)
    )}&state=${encodeURIComponent(String(state || ""))}`;

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>로그인 처리 중...</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <script>
            // iOS에서 더 확실하게 작동하도록 여러 방법 시도
            function openApp() {
              const uri = "${redirectUri}";
              console.log("리디렉션 URI:", uri);
              
              // 방법 1: 직접 리디렉션
              window.location.href = uri;
              
              // 방법 2: setTimeout으로 재시도
              setTimeout(function() {
                window.location.href = uri;
              }, 100);
              
              // 방법 3: iframe 사용 (iOS에서 더 잘 작동)
              const iframe = document.createElement("iframe");
              iframe.style.display = "none";
              iframe.src = uri;
              document.body.appendChild(iframe);
              
              setTimeout(function() {
                document.body.removeChild(iframe);
                window.location.href = uri;
              }, 500);
            }
            
            // 페이지 로드 시 즉시 실행
            openApp();
            
            // 클릭 이벤트도 추가
            document.addEventListener("click", openApp);
          </script>
          <p style="text-align: center; margin-top: 50px; font-size: 16px;">
            앱으로 리디렉션 중...<br>
            자동으로 이동하지 않으면 <a href="${redirectUri}" style="color: #4285f4;">여기를 클릭</a>하세요.
          </p>
        </body>
      </html>
    `);
  } catch (e: any) {
    console.error("Google callback error:", e);
    return res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// ✅ 서울 리전(asia-northeast3)으로 Express 앱 전체를 하나의 Function으로 export
export const api = functions.https.onRequest(
  {
    region: "asia-northeast3",
  },
  app
);
