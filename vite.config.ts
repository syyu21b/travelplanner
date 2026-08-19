import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { GeminiError, planTrip, planTripInputSchema } from "./server/gemini";

const PROJECT_ROOT = import.meta.dirname;

// vite dev 프로세스는 .env를 자동으로 process.env에 주입하지 않으므로(클라이언트 번들용
// import.meta.env만 채워짐), 서버 전용 플러그인(vitePluginPlanTripProxy 등)에서 쓰기 위해
// 직접 로드해 병합한다. 이미 실제 환경변수로 설정된 값(예: 배포 환경)은 덮어쓰지 않는다.
const dotEnv = loadEnv("development", PROJECT_ROOT, "");
for (const [key, value] of Object.entries(dotEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL("v1/storage/presign/get", forgeBaseUrl + "/");
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

// 로컬 개발(`pnpm dev`)에서 프로덕션의 Cloudflare Worker(server/worker.ts)와 동일한
// /api/plan-trip 엔드포인트를 제공. 실제 Gemini 호출 로직은 server/gemini.ts를 공유한다.
function vitePluginPlanTripProxy(): Plugin {
  return {
    name: "plan-trip-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/plan-trip", async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: ".env에 GEMINI_API_KEY가 설정되어 있지 않습니다." }));
          return;
        }

        let raw = "";
        req.on("data", (chunk) => {
          raw += chunk.toString();
        });

        req.on("end", async () => {
          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "요청 본문이 올바른 JSON이 아닙니다." }));
            return;
          }

          const parsed = planTripInputSchema.safeParse(body);
          if (!parsed.success) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() }));
            return;
          }

          try {
            const itinerary = await planTrip(parsed.data, apiKey);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ itinerary }));
          } catch (err) {
            const message = err instanceof GeminiError ? err.message : "일정 생성 중 오류가 발생했습니다.";
            const code = err instanceof GeminiError ? err.code : undefined;
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: message, code }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    jsxLocPlugin(),
    vitePluginManusDebugCollector(),
    vitePluginStorageProxy(),
    vitePluginPlanTripProxy(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.png", "favicon-32.png", "favicon.svg", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "Travel Planner - 여행 일정 플래너",
        short_name: "여행플래너",
        description: "나만의 여행 일정을 만들고, 기록하고, 공유해보세요.",
        lang: "ko",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F9F7F2",
        theme_color: "#A68B77",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/maskable-icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // /api/*로의 전체 페이지 이동(예: 소셜 로그인 <a href> 클릭)까지 navigateFallback이
        // 가로채 SPA 셸을 대신 띄우면, 서버가 실제로 302 리다이렉트해야 할 요청이 클라이언트
        // 라우터로 넘어가 존재하지 않는 경로라며 404가 떠버린다 — /api/*는 항상 네트워크로.
        navigateFallbackDenylist: [/^\/api\//],
        // 배포 시 이전 버전의 서비스 워커/캐시가 남아 사용자가 계속 옛 버전(버그가 있던 화면)을
        // 보게 되는 문제를 방지 — 새 버전이 감지되면 바로 활성화하고 캐시를 정리
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // 외부 API(네이버 지도, 날씨, 폰트 CDN 등)는 서비스 워커가 가로채지 않고
        // 항상 네트워크로 직접 요청되도록 프리캐시 대상에서 제외 (기본 동작, 명시적으로 문서화)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
        // 지도 라이브러리(maplibre-gl 등) 포함 시 메인 번들이 기본 2MiB 한도를 넘을 수 있어 여유를 둠
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 8080,
    strictPort: false, // Will find next available port if 8080 is busy
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
