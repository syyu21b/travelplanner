import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "icon-source.png");
const PUBLIC = path.join(__dirname, "..", "client", "public");

// 원본 이미지는 카드(아이콘)가 전체 캔버스의 절반 정도만 차지하고 나머지는
// 투명 배경이라, 그대로 쓰면 실제 기기에 설치했을 때 아이콘 주위에 여백이 크게
// 남아 보임. 카드 영역만 타이트하게 잘라내 실제 아이콘이 프레임 전체를 채우도록
// 함 (좌표는 카드의 알파 채널 경계를 기준으로 측정, 상하좌우 여백이 고르도록
// 카드 중심에 맞춰 정렬 — 이전 버전은 위쪽 여백이 아래쪽보다 넓어 아이콘이
// 살짝 아래로 쏠려 보였음).
const CROP = { left: 240, top: 209, width: 546, height: 546 };

// 브라우저 탭 파비콘은 16~32px로 아주 작게 표시되기 때문에, 카드 전체 모양보다는
// 비행기 그림 자체가 최대한 크고 진하게 보이는 게 중요함 — 비행기 그래픽의 실제
// 경계(알파 채널 기준 측정)를 중심으로 훨씬 타이트하게 잘라서 확대
const FAVICON_CROP = { left: 334, top: 284, width: 380, height: 380 };

const croppedSrc = sharp(SRC).extract(CROP);
const faviconSrc = sharp(SRC).extract(FAVICON_CROP);

const CARD_BG = { r: 235, g: 220, b: 208 }; // 카드 배경과 어울리는 베이지톤

// 카드는 둥근 모서리라 정사각형으로 자르면 네 귀퉁이가 투명하게 남음.
// 안드로이드/크롬 등은 "any" 아이콘의 투명 영역을 그대로 살려서 보여주므로,
// 배경색을 따로 채우지 않고 카드 자체의 둥근 모양이 아이콘 모양이 되도록 둠
// (= 다른 앱들처럼 아이콘 고유의 실루엣이 그대로 보임).
// 단, iOS는 apple-touch-icon의 투명 영역을 검게 칠해버리는 알려진 문제가 있어
// 그 파일만 예외적으로 불투명하게 채움 — 어차피 iOS는 자체적으로 모서리를
// 둥글게 마스킹하므로 배경을 채워도 최종적으로는 iOS 고유 모양대로 보임.
async function resizeTo(size, outFile, { transparent = true, source = croppedSrc } = {}) {
  let pipeline = source.clone().resize(size, size, { fit: "cover" });
  if (!transparent) {
    pipeline = pipeline.flatten({ background: CARD_BG });
  }
  await pipeline.png().toFile(path.join(PUBLIC, outFile));
  console.log(`✓ ${outFile} (${size}x${size}${transparent ? "" : ", flattened"})`);
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

await resizeTo(32, "favicon-32.png", { transparent: false, source: faviconSrc });
await resizeTo(180, "apple-touch-icon.png", { transparent: false }); // iOS는 투명 영역을 검게 렌더링함
await resizeTo(192, "pwa-192x192.png");
await resizeTo(512, "pwa-512x512.png");
// 기존 index.html이 참조하는 파일명 유지 (512 소스, 브라우저가 필요시 축소) — 이것도 탭/즐겨찾기 아이콘이라 확대된 크롭 사용
await resizeTo(512, "favicon.png", { transparent: false, source: faviconSrc });
await resizeMaskable(192, "maskable-icon-192x192.png");
await resizeMaskable(512, "maskable-icon-512x512.png");

console.log("\nAll icons generated.");
