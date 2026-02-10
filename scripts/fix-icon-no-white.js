/**
 * 앱 아이콘에서 흰색 여백 제거 후 원래 크기로 다시 확대
 * 1) 흰색 배경 trim → 2) 원본 해상도로 resize
 * 사용: npm install sharp --save-dev && node scripts/fix-icon-no-white.js
 */
const path = require("path");
const fs = require("fs");

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.error("sharp 패키지가 필요합니다. 프로젝트 루트에서 실행:");
  console.error("  npm install sharp --save-dev");
  process.exit(1);
}

const ICON_PATH = path.join(__dirname, "..", "assets", "images", "icon.png");
const BACKUP_PATH = path.join(__dirname, "..", "assets", "images", "icon.png.bak");

async function main() {
  if (!fs.existsSync(ICON_PATH)) {
    console.error("파일 없음:", ICON_PATH);
    process.exit(1);
  }

  const inputBuffer = fs.readFileSync(ICON_PATH);
  const meta = await sharp(inputBuffer).metadata();
  const origWidth = meta.width;
  const origHeight = meta.height;
  console.log("원본 크기:", origWidth, "x", origHeight);

  // 1) 흰색(및 비슷한 색) 여백 trim. threshold: 제거할 픽셀 허용 범위
  const trimmed = await sharp(inputBuffer)
    .trim({ threshold: 15 })
    .toBuffer({ resolveWithObject: true });

  console.log("trim 후 크기:", trimmed.info.width, "x", trimmed.info.height);

  // 2) 원래 크기로 다시 확대 (푸른 배경 + 흰 상자가 전체를 채움)
  await sharp(trimmed.data)
    .resize(origWidth, origHeight, { fit: "fill" })
    .png()
    .toFile(BACKUP_PATH);

  // 원본 백업 후 결과를 icon.png로 덮어쓰기
  fs.renameSync(ICON_PATH, ICON_PATH + ".orig");
  fs.renameSync(BACKUP_PATH, ICON_PATH);
  fs.unlinkSync(ICON_PATH + ".orig");

  console.log("완료:", ICON_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
