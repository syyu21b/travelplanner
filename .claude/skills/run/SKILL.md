---
description: Launch the Travel Planner dev server (Vite + React + TypeScript on port 8080)
---

# Run: Travel Planner Dev Server

## Launch

```bash
cd "C:\Users\SBS\Desktop\유신영\Travel Planner\travel-planner-intellij\travel-planner"
pnpm dev
```

The server starts on **http://localhost:8080** (falls back to next available port if 8080 is busy).

Wait for the line:
```
VITE vX.X.X  ready in XXX ms
  ➜  Local:   http://localhost:8080/
```

## Verify

Open http://localhost:8080 in a browser. You should see the Travel Planner home page with navigation tabs.

## Notes

- Package manager: **pnpm** (v10.4.1)
- Node: v24+
- All dependencies are in `node_modules/` — no install step needed unless deps change
- If port 8080 is busy, Vite auto-selects the next available port
- Hot reload is enabled; edit source files and the browser updates automatically
- `pnpm build` produces a production build in `dist/public/`
