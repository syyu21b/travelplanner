import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "icon-source.png");
const PUBLIC = path.join(__dirname, "..", "client", "public");

// 원본 이미지는 카드(아이콘)가 전체 캔버스의 절반 정도만 차지하고 나머지는
// 은은한 회색 글로우 배경이라, 그대로 쓰면 실제 기기에 설치했을 때 아이콘
// 주위에 여백이 크게 남아 보임. 카드 영역만 타이트하게 잘라내 실제 아이콘이
// 프레임 전체를 채우도록 함 (좌표는 카드의 베이지 톤(R-B 색차)을 기준으로 측정).
const CROP = { left: 242, top: 191, width: 546, height: 546 };

const croppedSrc = sharp(SRC).extract(CROP);

const CARD_BG = { r: 235, g: 220, b: 208 }; // 카드 배경과 어울리는 베이지톤

// 카드는 둥근 모서리라 정사각형으로 자르면 네 귀퉁이가 투명하게 남는데,
// 이게 흰 배경 위에서 "흰 여백"처럼 보이므로 카드와 같은 색으로 채워 완전 불투명하게 만듦
async function resizeTo(size, outFile) {
  await croppedSrc
    .clone()
    .resize(size, size, { fit: "cover" })
    .flatten({ background: CARD_BG })
    .png()
    .toFile(path.join(PUBLIC, outFile));
  console.log(`✓ ${outFile} (${size}x${size})`);
}

// maskable 아이콘: OS가 원형/둥근사각형 등으로 잘라내므로 중앙 안전영역(80%)에
// 실제 아이콘이 들어오도록 살짝 축소한 뒤 카드와 같은 베이지색으로 캔버스를 채움
async function resizeMaskable(size, outFile) {
  const inner = Math.round(size * 0.86);
  const resized = await croppedSrc
    .clone()
    .resize(inner, inner, { fit: "cover" })
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...CARD_BG, alpha: 1 },
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
