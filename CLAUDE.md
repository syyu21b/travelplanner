# Travel Planner Project

## 프로젝트 개요
React + TypeScript 기반 여행 플래너 웹앱. Vite 빌드, TailwindCSS 스타일링, shadcn/ui 컴포넌트 사용.

## 기술 스택
- **Frontend**: React 19, TypeScript, Vite
- **Styling**: TailwindCSS v4, shadcn/ui
- **Routing**: Wouter
- **State**: React useState + 서버(D1) 기반 상태 (fetch API 래퍼를 통해 로드/저장)
- **Backend**: Cloudflare Workers (Hono) + D1(SQLite, drizzle-orm) + R2(이미지/영상 저장)
- **Package Manager**: pnpm

## 주요 파일 구조
```
client/src/
  pages/
    TravelDiary.tsx   # 여행 기록 (블로그형/그리드형/슬라이드형)
    Home.tsx          # 홈 / 여행 계획
    Community.tsx     # 커뮤니티
    AuthPage.tsx      # 로그인/회원가입
  components/
    ui/               # shadcn/ui 컴포넌트들
  contexts/
    AuthContext.tsx   # 인증 상태 (서버 세션 쿠키 기반)
    ThemeContext.tsx  # 다크모드
  lib/
    api.ts            # 공용 fetch 래퍼 (ApiError)
    api/               # 도메인별 서버 API 클라이언트 (auth/plans/diaries/albums/community/notifications/media)

server/
  worker.ts            # Hono 앱 진입점 — 모든 /api/* 서브라우터를 마운트
  env.ts                # Cloudflare Worker bindings 타입 (DB, MEDIA, ...)
  db/
    schema.ts           # drizzle 스키마 (모든 테이블 정의)
    client.ts           # drizzle(env.DB) 팩토리
    migrations/          # drizzle-kit generate로 생성된 SQL 마이그레이션
  api/                   # 도메인별 Hono 라우터 (auth/plans/diaries/albums/community/notifications/inquiries/media)
  lib/
    password.ts          # PBKDF2 비밀번호 해시/검증
    session.ts            # 세션 쿠키 발급/조회
    middleware.ts          # attachUser/requireAuth/requireAdmin
    notify.ts              # 알림 생성 헬퍼 (설정 확인 + 인기글/여행 알림 중복 방지)
    media-url.ts            # R2 key → /api/media/:key URL 변환

shared/
  types.ts             # 클라이언트/서버 공유 도메인 타입 (TravelPlan, DiaryEntry, ...)
  const.ts             # COOKIE_NAME 등 공유 상수
```

## 개발 서버 실행
```bash
pnpm install
pnpm cf:dev   # Vite 빌드 + wrangler dev (로컬 D1/R2 에뮬레이션, http://localhost:8787)
```
`pnpm dev`(Vite만 단독 실행)로는 `/api/*` 요청이 응답하지 않으므로, 백엔드까지 함께 테스트하려면 `pnpm cf:dev`를 사용해야 한다.

DB 스키마를 바꿨다면: `pnpm db:generate` → `pnpm db:migrate:local` (로컬) / `pnpm db:migrate:remote` (배포 전, 실제 D1에 적용).

## 최근 수정 사항 (2026-08-18)
- **localStorage 기반 클라이언트 전용 앱 → Cloudflare D1(+R2) 기반 실서버 백엔드로 전체 마이그레이션 완료**
  - 인증: 비밀번호를 평문 대신 PBKDF2 해시로 저장, `sessions` 테이블 + httpOnly 쿠키 기반 세션으로 전환
  - 여행계획/여행기록/앨범/커뮤니티(좋아요·북마크·댓글)/알림/문의를 모두 D1 테이블 + REST API(`/api/*`)로 이전
  - 이미지/영상은 base64 대신 R2에 업로드하고 `/api/media/:key`로 서빙 (비공개 콘텐츠는 소유자 인증 필요)
  - 회원탈퇴 시 FK CASCADE로 해당 사용자의 계획/일기/댓글 등이 함께 삭제됨
  - 기존 localStorage 데이터는 마이그레이션하지 않음 — 사용자는 새 계정으로 다시 시작
- **2026-08-19**: R2 활성화, 원격 R2 버킷(`travelplanner-media`) 생성, 원격 D1 마이그레이션 적용, `pnpm run deploy`로 프로덕션 배포 완료 (https://travelplanner.syyu21b.workers.dev). `pnpm deploy`는 pnpm의 예약 명령어와 충돌하므로 반드시 `pnpm run deploy`로 실행할 것.

## 주의사항
- `node_modules/`, `dist/` 폴더는 편집 대상에서 제외
- 이미지는 클라이언트에서 compressImage로 압축(최대 1200px, quality 0.7) 후 `/api/media/upload`로 R2에 업로드 — base64를 DB에 직접 저장하지 않음
- 인증은 서버 세션(쿠키) 기반. `client/src/contexts/AuthContext.tsx`의 메서드 대부분이 비동기(API 호출)로 바뀌었으므로 새 호출부는 반드시 `await` 필요
- D1의 SQLite는 큰 TEXT 컬럼에 대한 넓은 `LIKE '%...%'` 스캔을 "pattern too complex"로 거부할 수 있음 — JSON 블롭 안에서 문자열을 찾아야 할 때는 SQL LIKE 대신 행을 가져와 JS에서 `.includes()`로 판정할 것 (`server/api/media.ts`의 `isPublicDiaryPhotoKey` 참고)
