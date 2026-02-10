#!/bin/bash
# 변동사항이 적용되지 않을 때: 캐시 전부 지우고 Metro 하나만 켠 뒤 앱 실행
# (실제 적용된 코드로 앱이 뜨도록 함)

set -e
cd "$(dirname "$0")/.."

echo "🔌 1. 기존 Metro 종료 (8081, 8082)..."
lsof -ti:8081 | xargs kill -9 2>/dev/null || true
lsof -ti:8082 | xargs kill -9 2>/dev/null || true
sleep 2

echo "🧹 2. Metro/Expo/Node 캐시 삭제..."
rm -rf node_modules/.cache .expo 2>/dev/null || true
rm -rf "$TMPDIR/metro-"* "$TMPDIR/haste-"* "$TMPDIR/react-"* 2>/dev/null || true
if command -v watchman &> /dev/null; then
  watchman watch-del-all 2>/dev/null || true
fi

echo "📱 3. iOS 빌드 캐시 삭제..."
rm -rf ~/Library/Developer/Xcode/DerivedData/PocketSpace-* 2>/dev/null || true
rm -rf ios/build 2>/dev/null || true

echo "✅ 캐시 정리 완료. Metro 실행 후 앱 빌드합니다..."
echo ""

# Metro를 백그라운드로 (현재 프로젝트 포트 8081)
npx expo start -c --port 8081 &
METRO_PID=$!
trap "kill $METRO_PID 2>/dev/null || true" EXIT

echo "⏳ Metro 기동 대기 (약 25초)..."
sleep 25

echo "📲 iOS 앱 빌드 및 실행 (이 Metro에 연결됩니다)..."
npx expo run:ios --no-bundler
