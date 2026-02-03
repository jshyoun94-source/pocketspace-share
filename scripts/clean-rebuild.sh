#!/bin/bash
# 변동사항이 적용되지 않을 때 사용하는 완전 초기화 + 재빌드 스크립트
# (대소문자/캐시 등으로 번들 스킵되는 문제 해결용)

set -e
cd "$(dirname "$0")/.."

echo "🧹 1. Metro/Expo/Node 캐시 삭제 중..."
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf .expo 2>/dev/null || true
# Watchman 캐시 (설치되어 있으면)
if command -v watchman &> /dev/null; then
  echo "   Watchman 캐시 삭제..."
  watchman watch-del-all 2>/dev/null || true
fi

echo "📱 2. iOS/Xcode 캐시 정리..."
rm -rf ~/Library/Developer/Xcode/DerivedData/PocketSpace-* 2>/dev/null || true
rm -rf ios/build 2>/dev/null || true

echo "✅ 3. 캐시 삭제 완료."
echo ""
echo "다음 명령을 순서대로 실행하세요:"
echo "  1) npx expo start --clear"
echo "  2) (다른 터미널에서) npx expo run:ios"
echo ""
echo "또는 한 번에: npx expo run:ios --no-bundler 로 빌드 후"
echo "별도 터미널에서 npx expo start --clear 실행하여 Metro 연결"
echo ""
