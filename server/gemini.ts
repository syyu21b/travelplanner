import { z } from "zod";

// Cloudflare Workers와 Vite dev 서버(Node) 양쪽에서 재사용되는 순수 fetch 기반 클라이언트.
// Node 전용 API(fs, http 등)에 의존하지 않아야 Worker 런타임에서도 그대로 동작한다.

export const planTripInputSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해주세요.").max(100),
  days: z.number().int().min(1, "최소 1일 이상이어야 합니다.").max(30, "최대 30일까지 가능합니다."),
  startDate: z.string().trim().max(20).optional(),
  preferences: z.string().trim().max(500).optional(),
  budget: z.string().trim().max(100).optional(),
});

export type PlanTripInput = z.infer<typeof planTripInputSchema>;

export interface ItineraryItem {
  time: string;
  title: string;
  description: string;
  location?: string;
  category: string;
  /** 이 일정을 위해 챙기면 좋은 준비물 (해당하는 경우에만) */
  preparations?: string[];
}

export interface ItineraryDay {
  day: number;
  summary: string;
  items: ItineraryItem[];
}

export interface ItineraryBudgetItem {
  category: string;
  /** 원화(KRW) 예상 금액 */
  amount: number;
  description: string;
}

export interface Itinerary {
  destination: string;
  /** 국내(한국) 여행이면 "domestic", 해외 여행이면 "overseas" */
  region: "domestic" | "overseas";
  days: ItineraryDay[];
  /** 카테고리별 예상 지출 내역 */
  budgets?: ItineraryBudgetItem[];
  tips?: string[];
}

export class GeminiError extends Error {
  /** 클라이언트가 에러 문구를 파싱하지 않고도 상황별로 분기할 수 있도록 하는 안정적인 식별자 */
  code?: "rate_limited" | "overloaded";

  constructor(message: string, code?: "rate_limited" | "overloaded") {
    super(message);
    this.code = code;
  }
}

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 무료 티어 모델은 트래픽이 몰리면 "일시적인 고수요"를 뜻하는 503 UNAVAILABLE을 꽤 자주
// 반환한다(구글 쪽에서도 "보통 일시적이니 잠시 후 재시도하라"고 안내하는 에러) — 이는
// 이 앱의 AI 사용량 한도와는 무관한 별개의 문제라서, 사용자에게 에러를 보여주기 전에
// 짧은 대기 후 몇 차례 자동 재시도로 대부분의 일시적 실패를 흡수한다.
const OVERLOAD_MAX_ATTEMPTS = 3;

async function fetchGeminiWithRetry(requestBody: Record<string, unknown>, apiKey: string): Promise<Response> {
  for (let attempt = 1; attempt <= OVERLOAD_MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      throw new GeminiError(`Gemini API 호출에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (response.status !== 503 || attempt === OVERLOAD_MAX_ATTEMPTS) {
      return response;
    }
    await sleep(1500 * attempt);
  }
  // 위 루프가 항상 return하므로 도달하지 않음 — 타입 체커를 위한 안전장치
  throw new GeminiError("Gemini API 호출에 실패했습니다.");
}

// Gemini responseSchema는 OpenAPI 3.0 Schema의 부분집합을 사용하며 type 값은 대문자여야 한다.
const BUDGET_CATEGORY_ENUM = ["식사", "관광", "이동", "숙박", "쇼핑", "기타"] as const;

const ITINERARY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    destination: { type: "STRING", description: "여행지 이름" },
    region: {
      type: "STRING",
      description: "여행지가 대한민국 국내면 domestic, 해외면 overseas",
      enum: ["domestic", "overseas"],
    },
    days: {
      type: "ARRAY",
      description: "일자별 일정 목록",
      items: {
        type: "OBJECT",
        properties: {
          day: { type: "INTEGER", description: "몇 번째 날인지 (1부터 시작)" },
          summary: { type: "STRING", description: "그 날 일정의 한 줄 요약" },
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                time: { type: "STRING", description: "시간 (예: 09:00)" },
                title: { type: "STRING", description: "활동 또는 장소 이름" },
                description: { type: "STRING", description: "간단한 설명" },
                location: {
                  type: "STRING",
                  description: "지도 검색(geocoding)에 그대로 사용될 값. 실제 존재하는 장소의 도로명 주소나, " +
                    "정확한 지명·건물명·상호명(지역명 포함, 예: '도쿄 시부야구 진구마에 시부야 스카이')을 적을 것 — " +
                    "'근처', '일대'처럼 검색이 안 되는 모호한 표현은 쓰지 말 것.",
                },
                category: {
                  type: "STRING",
                  enum: ["식사", "관광", "이동", "숙박", "쇼핑", "기타"],
                },
                preparations: {
                  type: "ARRAY",
                  description: "이 일정을 위해 챙기면 좋은 준비물. 특별히 필요한 게 없으면 빈 배열.",
                  items: { type: "STRING" },
                },
              },
              required: ["time", "title", "description", "category"],
              propertyOrdering: ["time", "title", "description", "location", "category", "preparations"],
            },
          },
        },
        required: ["day", "summary", "items"],
        propertyOrdering: ["day", "summary", "items"],
      },
    },
    budgets: {
      type: "ARRAY",
      description: "카테고리별 예상 지출 내역 (원화 기준 현실적인 금액)",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", enum: [...BUDGET_CATEGORY_ENUM] },
          amount: { type: "INTEGER", description: "예상 금액 (원, KRW)" },
          description: { type: "STRING", description: "지출 항목에 대한 간단한 설명" },
        },
        required: ["category", "amount", "description"],
        propertyOrdering: ["category", "amount", "description"],
      },
    },
    tips: {
      type: "ARRAY",
      description: "여행 팁 목록 (선택)",
      items: { type: "STRING" },
    },
  },
  required: ["destination", "region", "days"],
  propertyOrdering: ["destination", "region", "days", "budgets", "tips"],
} as const;

// 1단계: 자유 형식(스키마 제약 없음) 프롬프트. responseSchema를 함께 쓰면 모델이 목적지를
// 다른 지역으로 바꿔버리는 현상이 관찰되어(예: "도쿄" 요청 -> "강릉" 응답), 내용 생성은
// 반드시 스키마 없이 진행하고, 구조화는 별도의 2단계에서 처리한다.
function buildFreeformPrompt(input: PlanTripInput): string {
  const dest = input.destination;
  const lines = [
    `여행지 "${dest}"에 대한 여행 일정을 짜는 여행 일정 전문가입니다. 아래 조건에 맞는 상세한 여행 일정을 작성해주세요.`,
    "",
    `목적지: ${dest} (반드시 이 지역이어야 하며, 다른 지역으로 바꾸지 마세요)`,
    `기간: ${input.days}일`,
  ];
  if (input.startDate) lines.push(`출발일: ${input.startDate}`);
  if (input.preferences) lines.push(`선호사항: ${input.preferences}`);
  if (input.budget) lines.push(`예산: ${input.budget}`);
  lines.push(
    "",
    "각 날짜별로 오전/오후/저녁 활동을 시간 순서대로 배치하고, 이동 시간과 식사 시간도 고려해주세요.",
    `실제로 "${dest}"에 존재하는 장소 위주로 추천하고, 하루에 너무 많은 일정을 몰아넣지 마세요.`,
    "각 활동마다 지도 검색에 쓸 수 있는 구체적인 위치 정보(도로명 주소, 정확한 건물명/상호명+지역명)를 함께 적어주세요 " +
      "— '근처', '~일대'처럼 검색이 안 되는 모호한 표현은 피해주세요.",
    "각 활동에 필요하면 챙길 준비물도 언급해주세요.",
    "카테고리별(숙박/이동/식사/관광/쇼핑/기타)로 현실적인 예상 지출도 원화(KRW)로 추정해서 알려주세요.",
    "자유로운 글 형식으로 작성하면 됩니다 (표, 마크다운 모두 가능).",
  );
  return lines.join("\n");
}

// 2단계: 1단계에서 만든(이미 목적지가 확정된) 자유 형식 텍스트를 그대로 구조화만 하는 프롬프트.
// "새로 만들지 말고 재구성만 하라"고 명시해 모델이 내용을 바꾸지 않도록 한다.
function buildStructurePrompt(freeformItinerary: string, input: PlanTripInput): string {
  return [
    "아래는 이미 확정된 여행 일정입니다. 이 내용을 절대 새로 만들거나 다른 여행지로 바꾸지 말고,",
    "주어진 JSON 스키마 형식으로 그대로 옮겨 담아주세요 (재구성/정리 작업입니다).",
    `destination 필드는 반드시 "${input.destination}"으로 채우세요.`,
    "region 필드에는 이 여행지가 대한민국 국내면 domestic, 해외면 overseas를 넣어주세요.",
    "각 일정 항목의 preparations에는 본문에 언급된 준비물을, 언급이 없으면 그 활동에 실제로 필요할 만한 것을 판단해서 채우고, 특별히 없으면 빈 배열로 두세요.",
    "budgets에는 본문에 언급된 예상 지출을 카테고리별로 정리하고, 본문에 명시되지 않았다면 내용을 바탕으로 현실적인 금액을 추정해주세요.",
    "",
    "----- 원본 일정 -----",
    freeformItinerary,
  ].join("\n");
}

async function callGeminiText(prompt: string, apiKey: string): Promise<string> {
  const response = await fetchGeminiWithRetry(
    { contents: [{ role: "user", parts: [{ text: prompt }] }] },
    apiKey,
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    const code = response.status === 429 ? "rate_limited" : response.status === 503 ? "overloaded" : undefined;
    throw new GeminiError(`Gemini API 오류 (${response.status}): ${errText.slice(0, 500)}`, code);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new GeminiError("Gemini API가 예상치 못한 형식으로 응답했습니다.");
  }
  return text;
}

async function callGeminiStructured(prompt: string, apiKey: string): Promise<Itinerary> {
  const response = await fetchGeminiWithRetry(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: ITINERARY_RESPONSE_SCHEMA,
      },
    },
    apiKey,
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    const code = response.status === 429 ? "rate_limited" : response.status === 503 ? "overloaded" : undefined;
    throw new GeminiError(`Gemini API 오류 (${response.status}): ${errText.slice(0, 500)}`, code);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new GeminiError("Gemini API가 예상치 못한 형식으로 응답했습니다.");
  }

  try {
    return JSON.parse(text) as Itinerary;
  } catch {
    throw new GeminiError("Gemini API 응답을 JSON으로 파싱하지 못했습니다.");
  }
}

export async function planTrip(input: PlanTripInput, apiKey: string): Promise<Itinerary> {
  const freeform = await callGeminiText(buildFreeformPrompt(input), apiKey);
  const itinerary = await callGeminiStructured(buildStructurePrompt(freeform, input), apiKey);
  // 2단계 모델이 그래도 목적지를 바꿔치기하는 경우를 대비한 최후의 안전장치 — 원본 입력값으로 강제 고정
  itinerary.destination = input.destination;
  return itinerary;
}
