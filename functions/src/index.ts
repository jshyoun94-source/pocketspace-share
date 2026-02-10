// functions/src/index.ts
import * as crypto from "crypto";
import cors from "cors";
import express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as jwt from "jsonwebtoken";
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";

if (!admin.apps.length) {
  const cfg: admin.AppOptions = {};
  let storageBucket: string | undefined;
  try {
    const fc = process.env.FIREBASE_CONFIG;
    if (fc) {
      const parsed = JSON.parse(fc);
      storageBucket = parsed.storageBucket;
    }
  } catch {
    /* ignore */
  }
  if (!storageBucket && process.env.GCLOUD_PROJECT) {
    storageBucket = `${process.env.GCLOUD_PROJECT}.firebasestorage.app`;
  }
  if (storageBucket) cfg.storageBucket = storageBucket;
  admin.initializeApp(cfg);
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" })); // 이미지 base64 업로드용

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

/** Apple ID 토큰 검증용 (JWKS → 공개키) */
const APPLE_BUNDLE_ID = "com.jshyoun94.pocketspace";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
let appleKeysCache: { keys: any[]; at: number } | null = null;
const APPLE_KEYS_CACHE_MS = 60 * 60 * 1000;

async function getAppleSigningKey(kid: string): Promise<crypto.KeyObject> {
  if (
    !appleKeysCache ||
    Date.now() - appleKeysCache.at > APPLE_KEYS_CACHE_MS
  ) {
    const res = await fetch(APPLE_KEYS_URL);
    const data = await res.json();
    appleKeysCache = { keys: data.keys, at: Date.now() };
  }
  const jwk = appleKeysCache.keys.find((k: any) => k.kid === kid);
  if (!jwk) throw new Error("Apple signing key not found for kid");
  return crypto.createPublicKey({
    key: jwk,
    format: "jwk",
  });
}

/**
 * POST /auth/apple (nonce 문제 우회: 백엔드에서 Apple JWT 검증 후 Custom Token 발급)
 * body: { identityToken: string, email?: string | null, fullName?: { givenName?, familyName? } | null }
 */
app.post("/auth/apple", async (req, res) => {
  try {
    const { identityToken, email, fullName } = req.body || {};
    if (!identityToken) {
      return res.status(400).json({ error: "identityToken required" });
    }

    const decoded = jwt.decode(identityToken, { complete: true }) as any;
    if (!decoded?.header?.kid || !decoded?.payload) {
      return res.status(401).json({ error: "Invalid Apple token" });
    }
    const key = await getAppleSigningKey(decoded.header.kid);
    const payload = jwt.verify(identityToken, key, {
      algorithms: ["RS256"],
      issuer: "https://appleid.apple.com",
      audience: APPLE_BUNDLE_ID,
    }) as { sub: string; email?: string };

    const appleSub = payload.sub;
    const uid = `apple:${appleSub}`;
    const emailVal = email ?? payload.email ?? null;
    const displayName =
      fullName?.givenName || fullName?.familyName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(" ")
        : undefined;

    await admin
      .auth()
      .updateUser(uid, {
        email: emailVal || undefined,
        displayName: displayName || undefined,
      })
      .catch(async (err: any) => {
        if (err.code === "auth/user-not-found") {
          await admin.auth().createUser({
            uid,
            email: emailVal || undefined,
            displayName: displayName || undefined,
          });
        } else {
          throw err;
        }
      });

    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "apple",
      email: emailVal,
    });

    return res.json({
      customToken,
      profile: {
        id: uid,
        email: emailVal,
        name: displayName ?? null,
      },
    });
  } catch (e: any) {
    console.error("APPLE auth error:", e);
    return res.status(500).json({ error: e?.message ?? "Apple token invalid" });
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
    // 환경 변수 사용 (Firebase Functions v2 - process.env)
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
 * POST /upload-image
 * body: { base64: string, path: string, contentType?: string }
 * header: Authorization: Bearer <firebase-id-token>
 * RN에서 ArrayBuffer/Blob 미지원으로 클라이언트 업로드 대신 서버 업로드 사용 (v1)
 */
app.post("/upload-image", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization Bearer 토큰이 필요합니다." });
    }
    const idToken = authHeader.slice(7);

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const { base64, path, contentType = "image/jpeg", storageBucket: clientBucket } = req.body || {};
    if (!base64 || !path) {
      return res.status(400).json({ error: "base64, path가 필요합니다." });
    }

    // path가 해당 uid 소유 경로인지 검증 (spaces/{uid}/, storage-requests/{uid}/, community/{uid}/, requests/{uid}/)
    const allowedPrefixes = [
      `spaces/${uid}/`,
      `storage-requests/${uid}/`,
      `community/${uid}/`,
      `requests/${uid}/`,
    ];
    const allowed = allowedPrefixes.some((p) => path.startsWith(p));
    if (!allowed) {
      return res.status(403).json({ error: "업로드 경로가 허용되지 않습니다." });
    }

    // 클라이언트와 동일한 버킷 사용. .appspot.com이 없으면 .firebasestorage.app 시도
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) {
      return res.status(400).json({ error: "base64 디코딩 결과가 비어있습니다. 요청 크기 제한을 확인하세요." });
    }

    const projectId = process.env.GCLOUD_PROJECT ?? "";
    const alt = (name: string) =>
      name.endsWith(".appspot.com")
        ? `${name.replace(/\.appspot\.com$/, "")}.firebasestorage.app`
        : name.endsWith(".firebasestorage.app")
          ? `${name.replace(/\.firebasestorage\.app$/, "")}.appspot.com`
          : null;

    let bucketName: string | undefined = clientBucket;
    if (!bucketName) {
      try {
        const fc = process.env.FIREBASE_CONFIG;
        if (fc) bucketName = JSON.parse(fc).storageBucket;
      } catch {
        /* ignore */
      }
    }
    if (!bucketName) bucketName = `${projectId}.appspot.com`;

    let lastErr: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(path);
        await file.save(buffer, {
          contentType,
          metadata: { cacheControl: "public, max-age=31536000" },
        });
        return res.json({ path, bucket: bucketName });
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? e?.errors?.[0]?.message ?? "");
        const isBucketNotFound =
          e?.code === 404 || msg.includes("bucket does not exist") || msg.includes("does not exist");
        const nextBucket = alt(bucketName!);
        if (isBucketNotFound && nextBucket) {
          bucketName = nextBucket;
          continue;
        }
        throw e;
      }
    }
    console.error("upload-image error:", lastErr);
    return res.status(500).json({ error: lastErr?.message ?? "업로드 실패" });
  } catch (e: any) {
    console.error("upload-image error:", e);
    return res.status(500).json({ error: e?.message ?? "업로드 실패" });
  }
});

/**
 * POST /call/masked
 * body: { chatId: string }
 * header: Authorization: Bearer <firebase-id-token>
 * 약속 확정 후 채팅 상대와 안심번호(050 등)로 연결. 실제 연동 전까지 501 반환.
 * 연동 시: users/{uid}.phoneNumber 필요, MTONET 등 API 호출 후 numberToDial 반환.
 */
app.post("/call/masked", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization Bearer 토큰이 필요합니다." });
    }
    const idToken = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    const { chatId } = req.body || {};
    if (!chatId || typeof chatId !== "string") {
      return res.status(400).json({ error: "chatId가 필요합니다." });
    }

    const chatSnap = await admin.firestore().doc(`chats/${chatId}`).get();
    if (!chatSnap.exists) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없습니다." });
    }
    const chat = chatSnap.data()!;
    const { ownerId, customerId } = chat;
    if (callerUid !== ownerId && callerUid !== customerId) {
      return res.status(403).json({ error: "해당 채팅방 참여자가 아닙니다." });
    }
    const calleeUid = callerUid === ownerId ? customerId : ownerId;

    const callerSnap = await admin.firestore().doc(`users/${callerUid}`).get();
    const calleeSnap = await admin.firestore().doc(`users/${calleeUid}`).get();
    const callerPhone = callerSnap.data()?.phoneNumber ?? callerSnap.data()?.phone ?? null;
    const calleePhone = calleeSnap.data()?.phoneNumber ?? calleeSnap.data()?.phone ?? null;

    if (!callerPhone || typeof callerPhone !== "string") {
      return res.status(400).json({
        error: "통화하려면 마이페이지에서 전화번호를 등록해 주세요.",
      });
    }
    if (!calleePhone || typeof calleePhone !== "string") {
      return res.status(400).json({
        error: "상대방이 전화번호를 등록하지 않아 연결할 수 없습니다.",
      });
    }

    // TODO: MTONET(엠투넷) 등 안심번호 API 연동 시 여기서 호출 후 numberToDial 반환
    // 예: const { numberToDial } = await callMaskedCallApi(callerPhone, calleePhone);
    // return res.json({ numberToDial });
    return res.status(501).json({
      error: "안심번호 서비스 연동 준비 중입니다.",
      code: "NOT_CONFIGURED",
    });
  } catch (e: any) {
    console.error("call/masked error:", e);
    return res.status(500).json({ error: e?.message ?? "통화 연결 처리에 실패했습니다." });
  }
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

/**
 * POST /delete-test-neighborhood-chat
 * body: { "confirm": "delete test neighborhood chat with lastMessage 그래안녕" }
 * 동네부탁 채팅 중 마지막 메시지가 "그래안녕"인 채팅과 연결된 동네부탁 문서를 삭제합니다.
 * 한 번 실행 후 이 엔드포인트/코드는 제거해도 됩니다.
 */
app.post("/delete-test-neighborhood-chat", async (req, res) => {
  try {
    const confirm = req.body?.confirm;
    if (confirm !== "delete test neighborhood chat with lastMessage 그래안녕") {
      return res.status(400).json({
        error: "body.confirm 값이 일치하지 않습니다. 삭제하려면 해당 문자열을 정확히 보내주세요.",
      });
    }

    const firestore = admin.firestore();
    const chatsSnap = await firestore
      .collection("chats")
      .where("lastMessage", "==", "그래안녕")
      .get();

    const deleted: { chatIds: string[]; requestIds: string[] } = { chatIds: [], requestIds: [] };

    for (const chatDoc of chatsSnap.docs) {
      const data = chatDoc.data();
      const requestId = data.requestId as string | undefined;
      if (!requestId) continue;

      const chatId = chatDoc.id;

      // messages 서브컬렉션 전체 삭제
      const messagesSnap = await firestore.collection("chats").doc(chatId).collection("messages").get();
      const batch = firestore.batch();
      messagesSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(chatDoc.ref);
      await batch.commit();

      deleted.chatIds.push(chatId);

      // 연결된 동네부탁 문서 삭제
      const requestRef = firestore.collection("neighborhoodRequests").doc(requestId);
      const requestSnap = await requestRef.get();
      if (requestSnap.exists) {
        await requestRef.delete();
        deleted.requestIds.push(requestId);
      }
    }

    return res.json({
      message: "삭제 완료",
      deleted,
    });
  } catch (e: any) {
    console.error("delete-test-neighborhood-chat error:", e);
    return res.status(500).json({ error: e?.message ?? "삭제 중 오류가 발생했습니다." });
  }
});

// ✅ 서울 리전(asia-northeast3)으로 Express 앱 전체를 하나의 Function으로 export
export const api = functions.https.onRequest(
  {
    region: "asia-northeast3",
  },
  app
);

const db = admin.firestore();

/**
 * 즐겨찾기 추가 시 해당 공간의 favoriteCount +1 (클라이언트 권한 무관)
 */
export const onFavoriteCreated = onDocumentCreated(
  {
    document: "users/{userId}/favorites/{favoriteId}",
    region: "asia-northeast3",
  },
  async (event) => {
    const spaceId = event.data?.data()?.spaceId;
    if (!spaceId || typeof spaceId !== "string") return;
    try {
      await db.doc(`spaces/${spaceId}`).update({
        favoriteCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error("onFavoriteCreated favoriteCount increment failed:", e);
    }
  }
);

/**
 * 즐겨찾기 제거 시 해당 공간의 favoriteCount -1
 */
export const onFavoriteDeleted = onDocumentDeleted(
  {
    document: "users/{userId}/favorites/{favoriteId}",
    region: "asia-northeast3",
  },
  async (event) => {
    const spaceId = event.data?.data()?.spaceId;
    if (!spaceId || typeof spaceId !== "string") return;
    try {
      await db.doc(`spaces/${spaceId}`).update({
        favoriteCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error("onFavoriteDeleted favoriteCount decrement failed:", e);
    }
  }
);

/** 마음공간 점수 계산 (클라이언트 constants/mindSpace.ts와 동일 로직) */
const MIND_SPACE_DEFAULT = 50;
const MIND_SPACE_MIN = 0;
const MIND_SPACE_MAX = 100;
const MAX_CHANGE_PER_TX = 3;

const SCORE_DELTA: { min: number; max: number; delta: number }[] = [
  { min: 5.0, max: 5.0, delta: 0.3 },
  { min: 4.0, max: 4.9, delta: 0.2 },
  { min: 3.0, max: 3.9, delta: 0.1 },
  { min: 2.0, max: 2.9, delta: -0.1 },
  { min: 1.0, max: 1.9, delta: -0.2 },
  { min: 0, max: 0.9, delta: -0.2 },
];

function calcMindSpaceDelta(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const entry = SCORE_DELTA.find((r) => avg >= r.min && avg <= r.max);
  let delta = entry?.delta ?? 0;
  delta = Math.max(
    -MAX_CHANGE_PER_TX,
    Math.min(MAX_CHANGE_PER_TX, delta)
  );
  return Math.round(delta * 10) / 10;
}

function applyMindSpaceDelta(current: number, delta: number): number {
  const next = current + delta;
  return Math.max(
    MIND_SPACE_MIN,
    Math.min(MIND_SPACE_MAX, Math.round(next * 10) / 10)
  );
}

/**
 * 트랜잭션에 평가가 반영되면 해당 사용자의 마음공간(mindSpace) 업데이트
 */
export const onTransactionEvaluationUpdated = onDocumentUpdated(
  {
    document: "transactions/{transactionId}",
    region: "asia-northeast3",
  },
  async (event) => {
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    if (!after || !before) return;

    // 구매자가 공간대여자 평가한 경우 → ownerId 사용자 mindSpace 갱신
    if (
      after.customerEvaluatedOwner === true &&
      after.customerEvaluation &&
      before.customerEvaluatedOwner !== true
    ) {
      const ev = after.customerEvaluation as {
        schedule?: number;
        storageCondition?: number;
        manners?: number;
      };
      const scores = [ev.schedule, ev.storageCondition, ev.manners].filter(
        (n): n is number => typeof n === "number"
      );
      if (scores.length > 0) {
        const targetUid = after.ownerId as string;
        try {
          const userRef = db.doc(`users/${targetUid}`);
          const userSnap = await userRef.get();
          const current =
            (userSnap.data()?.mindSpace as number) ?? MIND_SPACE_DEFAULT;
          const delta = calcMindSpaceDelta(scores);
          const next = applyMindSpaceDelta(current, delta);
          await userRef.update({
            mindSpace: next,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(
            `mindSpace updated owner ${targetUid}: ${current} -> ${next} (delta ${delta})`
          );
        } catch (e) {
          console.error("onTransactionEvaluationUpdated owner mindSpace:", e);
        }
      }
    }

    // 공간대여자가 사용자 평가한 경우 → customerId 사용자 mindSpace 갱신
    if (
      after.ownerEvaluatedCustomer === true &&
      after.ownerEvaluation &&
      before.ownerEvaluatedCustomer !== true
    ) {
      const ev = after.ownerEvaluation as { schedule?: number; manners?: number };
      const scores = [ev.schedule, ev.manners].filter(
        (n): n is number => typeof n === "number"
      );
      if (scores.length > 0) {
        const targetUid = after.customerId as string;
        try {
          const userRef = db.doc(`users/${targetUid}`);
          const userSnap = await userRef.get();
          const current =
            (userSnap.data()?.mindSpace as number) ?? MIND_SPACE_DEFAULT;
          const delta = calcMindSpaceDelta(scores);
          const next = applyMindSpaceDelta(current, delta);
          await userRef.update({
            mindSpace: next,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(
            `mindSpace updated customer ${targetUid}: ${current} -> ${next} (delta ${delta})`
          );
        } catch (e) {
          console.error("onTransactionEvaluationUpdated customer mindSpace:", e);
        }
      }
    }
  }
);
