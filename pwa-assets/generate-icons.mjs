import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "icon-source.png");
const PUBLIC = path.join(__dirname, "..", "client", "public");

// 배경이 이미 불투명(회색 그라디언트)이므로 그대로 리사이즈 — 별도 패딩/마스크 처리 불필요
async function resizeTo(size, outFile) {
  await sharp(SRC)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(path.join(PUBLIC, outFile));
  console.log(`✓ ${outFile} (${size}x${size})`);
}

// maskable 아이콘: OS가 원형/둥근사각형 등으로 잘라내므로 중앙 안전영역(80%)에
// 실제 아이콘이 들어오도록 살짝 축소한 뒤 원본 배경색(그라디언트 중심의 베이지)으로 캔버스를 채움
async function resizeMaskable(size, outFile) {
  const inner = Math.round(size * 0.8);
  const resized = await sharp(SRC)
    .resize(inner, inner, { fit: "cover" })
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 235, g: 220, b: 208, alpha: 1 }, // 아이콘 배경과 어울리는 베이지톤
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toFile(path.join(PUBLIC, outFile));
  console.log(`✓ ${outFile} (maskable, ${size}x${size})`);
}

await resizeTo(32, "favicon-32.png");
await resizeTo(180, "apple-touch-icon.png");
await resizeTo(192, "pwa-192x192.png");
await resizeTo(512, "pwa-512x512.png");
await resizeTo(512, "favicon.png"); // 기존 index.html이 참조하는 파일명 유지 (512 소스, 브라우저가 필요시 축소)
await resizeMaskable(192, "maskable-icon-192x192.png");
await resizeMaskable(512, "maskable-icon-512x512.png");

console.log("\nAll icons generated.");
