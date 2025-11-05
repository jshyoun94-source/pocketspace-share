import cors from "cors";
import express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  admin.initializeApp(); // Functions 기본 서비스계정 사용
}

const app = express();
app.use(cors({origin: true}));
app.use(express.json());

/**
 * POST /auth/naver
 * body: { accessToken: string }
 * 1) 네이버 토큰 검증 & 프로필 조회
 * 2) Firebase 커스텀토큰 발급
 * 3) { customToken, profile } 반환
 */
app.post("/auth/naver", async (req, res) => {
  try {
    const {accessToken} = req.body || {};
    if (!accessToken) {
      return res.status(400).json({error: "accessToken required"});
    }

    // 네이버 프로필 조회
    const r = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    const data: any = await r.json();

    if (!data || data.resultcode !== "00" || !data.response?.id) {
      return res.status(401).json({error: "NAVER token invalid", raw: data});
    }

    const profile = data.response; // { id, email?, name?, profile_image? ... }
    const naverId = profile.id;
    const uid = `naver:${naverId}`;

    // Firebase 커스텀 토큰 발급
    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "naver",
      email: profile.email ?? null,
    });

    return res.json({customToken, profile});
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({error: e?.message ?? "server error"});
  }
});

// 리전은 서울(asia-northeast3) 권장. 필요시 변경 가능.
// ✅ 최신 firebase-functions v6 스타일
export const api = functions.https.onRequest(
  {
    region: "asia-northeast3",
  },
  app
);

