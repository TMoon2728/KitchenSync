# KitchenSync (`NewImproved`) — Architectural Context

| Layer | Stack / Entrypoint | Core Invariants |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite (`App.tsx`, `pages/*`, `context/*`) | Optimistic local state mirrored to `localStorage` (`ks_*`) and synced to PostgreSQL via `authFetch`. |
| **Backend** | Express 5 (`server/index.js`, `server/routes/api.js`, `server/routes/data.js`) | Auth0 RS256 JWT (`server/middleware/auth.js`), household multi-tenancy (`effective_household`), atomic credit ledger. |
| **Database** | PostgreSQL (`server/db.js`, `pg.Pool`) | Tables: `users`, `recipes` (JSONB), `pantry`, `shopping_list`, `meal_plans` (household-scoped JSONB). |
| **AI & Normalization** | `@google/genai` (`gemini-2.5-flash`) + `ingredientNormalizer.{ts,js}` | Server-side Gemini proxy (`api.js`), SSRF-guarded URL/Pinterest scraper, canonical grocery category & unit normalizer. |
| **External Hub API** | `GET/POST /api/data/external/meal-plan` (`X-API-Key`) | Timing-safe `crypto.timingSafeEqual` key check (`EXTERNAL_API_KEY`) for Family Hub (`busy-meitner`) bi-directional sync. |
