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
    const uid = `naver:${naverId}`;

    const customToken = await admin.auth().createCustomToken(uid, {
      provider: "naver",
      email: profile.email ?? null,
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

// ✅ 서울 리전(asia-northeast3)으로 Express 앱 전체를 하나의 Function으로 export
export const api = functions.https.onRequest(
  {
    region: "asia-northeast3",
  },
  app
);
