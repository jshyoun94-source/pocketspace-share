#!/bin/bash
# App Store Connect iPhone 6.5" 요구 크기: 1284 × 2778px
# 사용법: app-store-screenshots/ 폴더에 PNG 넣고 이 스크립트 실행

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$PROJECT_ROOT/app-store-screenshots"
OUT="$PROJECT_ROOT/app-store-screenshots/resized"

mkdir -p "$OUT"

count=0
for f in "$SRC"/*.png "$SRC"/*.PNG; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  echo "리사이즈 중: $name -> 1284×2778"
  sips -z 2778 1284 "$f" --out "$OUT/$name"
  ((count++))
done

if [ "$count" -eq 0 ]; then
  echo "app-store-screenshots/ 폴더에 PNG 파일이 없습니다. 스크린샷 3장을 넣은 뒤 다시 실행하세요."
else
  echo "완료: $count 개 파일이 app-store-screenshots/resized/ 에 저장되었습니다."
fi
