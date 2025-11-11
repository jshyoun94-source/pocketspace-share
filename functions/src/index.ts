import cors from "cors";
import express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  admin.initializeApp(); // Functions 기본 서비스계정 사용
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/**
 * ✅ NAVER 로그인 → Firebase 커스텀토큰 발급
 */
app.post("/auth/naver", async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken required" });
    }

    // 네이버 프로필 조회
    const r = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: any = await r.json();

    if (!data || data.resultcode !== "00" || !data.response?.id) {
      return res.status(401).json({ error: "NAVER token invalid", raw: data });
    }

    const profile = data.response; // { id, email?, name?, profile_image? ... }
    const naverId = profile.id;
    const uid = `naver:${naverId}`;

    // Firebase 커스텀 토큰 발급
    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "naver",
      email: profile.email ?? null,
    });

    return res.json({ customToken, profile });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});

/**
 * ✅ Kakao Redirect Bridge (for https → native app)
 * Kakao에서 HTTPS redirect_uri로 code를 전달하면,
 * 이 함수가 중간에서 앱 스킴(com.jshyoun94.pocketspace://auth/kakao)으로 다시 넘겨준다.
 */
/**
 * ✅ Kakao Redirect Bridge (for https → native app)
 * Kakao에서 HTTPS redirect_uri로 code를 전달하면,
 * 이 함수가 중간에서 앱 스킴(com.jshyoun94.pocketspace://auth/kakao)으로 다시 넘겨준다.
 */
export const kakaoRedirect = functions.https.onRequest(
  { region: "asia-northeast3" },
  (req, res): void => {
    const code = req.query.code as string | undefined;

    if (!code) {
      console.warn("❌ No Kakao auth code received:", req.query);
      res.status(400).send("Missing code parameter");
      return; // ✅ void로 끝
    }

    const redirectUrl = `com.jshyoun94.pocketspace://auth/kakao?code=${encodeURIComponent(
      code
    )}`;
    console.log("✅ Redirecting Kakao code to app:", redirectUrl);

    res.redirect(302, redirectUrl);
    // ✅ return 안 함 (res.redirect가 자체적으로 응답 끝냄)
  }
);


/**
 * ✅ Express API (Naver 등)
 */
export const api = functions.https.onRequest(
  {
    region: "asia-northeast3",
  },
  app
);
