// app.config.ts
import 'dotenv/config';
import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'PocketSpace',
  slug: 'pocketspace',
  // 여기의 extra는 선택사항(안 써도 됨). 써도 되고 안 써도 됨.
  extra: {
    ...config.extra,
    EXPO_PUBLIC_NAVER_CLIENT_ID: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
    EXPO_PUBLIC_NAVER_CLIENT_SECRET: process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET,
  },
});
// ✅ 테스트 푸시용 주석 (이 줄은 아무 기능에도 영향 없음)
