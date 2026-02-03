#!/bin/bash
# Xcode 빌드 잠금 해제 및 재시도

echo "1. 실행 중인 Xcode/xcodebuild 프로세스 종료..."
pkill -f xcodebuild 2>/dev/null || true
pkill -f "Xcode" 2>/dev/null || true
sleep 2

echo "2. PocketSpace DerivedData 삭제..."
rm -rf ~/Library/Developer/Xcode/DerivedData/PocketSpace-*

echo "3. Pods 클린..."
cd "$(dirname "$0")/.."
cd ios && rm -rf build && cd ..

echo "완료! 이제 다음 명령어로 빌드하세요:"
echo "  npx expo run:ios"
