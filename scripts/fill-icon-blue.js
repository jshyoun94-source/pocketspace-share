/**
 * 아이콘에서 "둥근 모서리와 바깥 정사각형 사이" 흰색 여백만 투명(alpha=0)으로 만듦.
 * 가운데 흰 상자·푸른 배경은 유지. 코너/가장자리와 연결된 흰색만 투명 처리.
 * 사용: node scripts/fill-icon-blue.js
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

function isWhite(r, g, b, a) {
  const alpha = a ?? 255;
  return alpha > 250 && r > 240 && g > 240 && b > 240;
}

function isSameColor(r, g, b, ref, tol = 25) {
  return (
    Math.abs(r - ref.r) <= tol &&
    Math.abs(g - ref.g) <= tol &&
    Math.abs(b - ref.b) <= tol
  );
}

async function main() {
  if (!fs.existsSync(ICON_PATH)) {
    console.error("파일 없음:", ICON_PATH);
    process.exit(1);
  }

  const inputBuffer = fs.readFileSync(ICON_PATH);
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const channels = 4;
  console.log("크기:", w, "x", h, "채널: RGBA");

  const idx = (x, y) => (y * w + x) * channels;
  const getPixel = (x, y) => {
    const i = idx(x, y);
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };
  const setPixel = (x, y, r, g, b, a) => {
    const i = idx(x, y);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  };

  // 코너 쪽에 칠해진 파란색 샘플 (이전에 채웠던 영역)
  const cornerBlue = getPixel(5, 5);
  const isEdgeFill = (p) =>
    isWhite(p.r, p.g, p.b, p.a) || isSameColor(p.r, p.g, p.b, cornerBlue, 30);

  // 코너/가장자리에서 연결된 흰색 또는 “코너 파란색”만 투명으로 치환 (BFS)
  const visited = new Uint8Array(w * h);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const k = y * w + x;
    if (visited[k]) return;
    visited[k] = 1;
    const p = getPixel(x, y);
    if (!isEdgeFill(p)) return;
    queue.push([x, y]);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    setPixel(x, y, 0, 0, 0, 0); // 투명
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  const outPath = path.join(__dirname, "..", "assets", "images", "icon.png");
  await sharp(data, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toFile(outPath + ".tmp");

  fs.renameSync(outPath + ".tmp", outPath);
  console.log("완료: 코너/흰 여백 → 투명. 출력:", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
