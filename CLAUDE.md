# Travel Planner Project

## 프로젝트 개요
React + TypeScript 기반 여행 플래너 웹앱. Vite 빌드, TailwindCSS 스타일링, shadcn/ui 컴포넌트 사용.

## 기술 스택
- **Frontend**: React 19, TypeScript, Vite
- **Styling**: TailwindCSS v4, shadcn/ui
- **Routing**: Wouter
- **State**: React useState / localStorage 기반 클라이언트 상태
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
    AuthContext.tsx   # 인증 상태
    ThemeContext.tsx  # 다크모드
```

## 개발 서버 실행
```bash
pnpm install
pnpm dev
```

## 최근 수정 사항
- `client/src/pages/TravelDiary.tsx`: 블로그형 편집 모드에서 사진 추가 버그 수정
  - `editBlockFileInputRef` 추가 (블로그형 편집 전용 파일 input ref)
  - `handleEditBlockImageUpload` 함수 추가 (이미지 → 블록 + photos 배열 동시 추가)
  - 블로그형 에디터 내부에 `<input>` 태그 삽입 및 버튼 연결

## 주의사항
- `node_modules/`, `dist/` 폴더는 편집 대상에서 제외
- 이미지는 base64로 localStorage에 저장 (compressImage 함수로 최대 1200px, quality 0.7 압축)
- 인증은 localStorage 기반 (실제 서버 없음)
