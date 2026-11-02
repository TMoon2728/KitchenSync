# M-AUDIT SECURITY & STABILITY REPORT
**Execution Date:** 2026-11-01
**Target Commit/State:** `023a274` (`main` — KitchenSync Full-Stack Repository)
**Overall Risk Assessment:** CRITICAL

---

## 1. Executive Summary & SPOF Heatmap

An adversarial static, architectural, and concurrency audit (`M-AUDIT v2.0`) was conducted across the `KitchenSync` repository (`023a274`). While the core product loop (**Recipe Ingestion → Meal Planner → Pantry-Deducted Shopping List**) and pre-flight atomic SQL credit checks on primary Gemini endpoints are operational, **10 distinct security, resilience, and state-integrity vulnerabilities** were identified—including **2 Critical** and **4 High** severity findings that require immediate remediation before production traffic scales.

### Primary Vulnerabilities Identified
1. **Committed Production Database Credentials (`V-01` — CRITICAL):** A live Render PostgreSQL connection URI containing plaintext username and password credentials is hardcoded in [`query.js`](file:///c:/Users/Tmoon/NewImproved/query.js#L3-L6) and tracked in Git history. Additionally, [`.gitignore`](file:///c:/Users/Tmoon/NewImproved/.gitignore#L13) only ignores `*.local`, leaving `.env` and [`data/kitchensync.db`](file:///c:/Users/Tmoon/NewImproved/data/kitchensync.db) unignored.
2. **Unauthenticated Household Cloud Sync & Account Enumeration (`V-02` — CRITICAL):** [`GET /api/data/hub-sync`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L111-L126) and [`POST /api/data/hub-sync`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L129-L218) bypass `requireAuth` and allow lookup by **plaintext email** (`LOWER(u.email) = LOWER($1)`), **sequential household/user ID** (`u.household_id = $1`), or a 24-bit invite code (`KS-XXXXXX`) with zero rate limiting. Any caller who knows a user's email address can read or overwrite their entire recipes, pantry, and meal plan.
3. **Unsigned JWT (`alg: "none"`) Dev Bypass, Admin Auto-Provisioning & Partial-Auth Passthrough (`V-03` — HIGH):** [`authenticateToken`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L176-L189) accepts unsigned tokens whenever `NODE_ENV !== 'production'`, [`populateUser`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L105-L108) grants `pro` tier + `9999` credits when `sub === 'admin'`, and failed DB lookups set `req.user = req.auth` (an object with `req.user.id === undefined`), bypassing [`requireAuth`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L207-L210).
4. **Residual Credit TOCTOU & Unconditional Error-Handler Credit Inflation (`V-04` — HIGH):** [`POST /api/credits/consume`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L208-L235) still performs a non-atomic read-then-update, while all six AI endpoints in [`server/routes/api.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L373-L384) unconditionally refund credits inside `catch` blocks even when the exception occurred *prior* to credit deduction or with a caller-supplied `req.body.cost`.
5. **SSRF Redirect Bypass & Unbounded HTML Memory Buffering (`V-05` — HIGH):** [`fetchSingleUrlInsights`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L696-L715) follows HTTP redirects automatically (`redirect: 'follow'`) and still buffers `await pageResponse.text()` even if the redirected destination fails [`isSafePublicUrl`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L523-L546).

### Top Architectural Single Points of Failure (SPOF Heatmap)

```
+-----------------------------------------------------------------------------------+
|                        ARCHITECTURAL SPOF & RISK HEATMAP                          |
+-----------------------------------+-------------------+---------------------------+
| Component / Boundary              | Failure Mode      | Blast Radius              |
+-----------------------------------+-------------------+---------------------------+
| server/db.js:12-15                | process.exit(-1)  | CRITICAL: Any transient   |
| (PostgreSQL Pool Error Handler)   | on idle client    | Render DB reset kills the |
|                                   | disconnect        | entire Node.js server.    |
+-----------------------------------+-------------------+---------------------------+
| server/routes/data.js:111-218     | Unauthenticated   | CRITICAL: Full read/write |
| (/api/data/hub-sync)              | email/ID lookup & | takeover of household     |
|                                   | pantry PK churn   | recipes, pantry & plans.  |
+-----------------------------------+-------------------+---------------------------+
| server/middleware/auth.js:51-77   | Uncached, no-TTL  | HIGH: Auth0 429 rate-limit|
| (Blocking Auth0 /userinfo Fetch)  | synchronous fetch | stalls all authenticated  |
|                                   | on every request  | API endpoints globally.   |
+-----------------------------------+-------------------+---------------------------+
| server/index.js:12-16             | Missing           | HIGH: All users share one |
| (Reverse Proxy & Rate Limiter)    | trust proxy = 1   | IP bucket on Render; 10   |
|                                   |                   | reqs/min blocks everyone. |
+-----------------------------------+-------------------+---------------------------+
| server/routes/data.js:482-497     | Last-writer-wins  | MEDIUM: Concurrent Hub &  |
| (Monolithic Meal Plan JSONB)      | full JSONB        | web edits silently erase  |
|                                   | overwrite         | household meal plans.     |
+-----------------------------------+-------------------+---------------------------+
```

---

## 2. Vulnerability Ledger

| ID | Category | Severity (Critical/High/Med/Low) | Status | Affected Path/Component | Finding Summary |
|---|---|---|---|---|---|
| **V-01** | Secret Leakage & Git Hygiene | **Critical** | ✅ Remediated | [`query.js:4`](file:///c:/Users/Tmoon/NewImproved/query.js#L4), [`.gitignore:13`](file:///c:/Users/Tmoon/NewImproved/.gitignore#L13) | Removed hardcoded URI from `query.js` (now uses `process.env.DATABASE_URL`); added `.env`, `.env.*`, `*.db`, `*.sqlite*` to `.gitignore`. *(Note: Rotate Render DB password in dashboard).* |
| **V-02** | Broken Access Control / IDOR | **Critical** | ✅ Remediated | [`server/routes/data.js:8-21, 111-218`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L8-L21) | Added `hubSyncLimiter`, removed unauthenticated email & sequential `household_id` lookup, and increased invite code entropy to 8 hex chars. |
| **V-03** | Authentication & Privilege Escalation | **High** | ✅ Remediated | [`server/middleware/auth.js:105, 149-156, 176, 207`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L176-L210) | Gated dev tokens behind `isDevTokenAllowed()`, removed `sub: "admin"` auto-upgrade, set `req.user = null` on failure, and enforced `req.user?.id` in `requireAuth`. |
| **V-04** | Concurrency / Financial Logic | **High** | ✅ Remediated | [`server/routes/api.js:208-235, 314-384, 806-985`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L208-L235) | Made `/api/credits/consume` atomic (`WHERE credits >= $1`) and gated all AI error-handler refunds behind `if (creditDeducted && deductedUserId)`. |
| **V-05** | SSRF & Memory Exhaustion (DoS) | **High** | ✅ Remediated | [`server/routes/api.js:523-546, 695-715`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L523-L546) | Added DNS resolution validation (`assertSafeResolvedHost`), manual per-hop redirect validation, IPv6/CGNAT filtering, and 2 MB bounded stream reading (`readBoundedText`). |
| **V-06** | Availability SPOF & Transport Security | **High** | ✅ Remediated | [`server/db.js:9-15`](file:///c:/Users/Tmoon/NewImproved/server/db.js#L9-L15) | Removed `process.exit(-1)` from `pool.on('error')`, configured pool limits/timeouts, and added `DATABASE_CA_CERT` / `DB_SSL_REJECT_UNAUTHORIZED` support. |
| **V-07** | Concurrency & Lost Updates | **Medium** | ✅ Remediated | [`server/routes/data.js:152-191`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L152-L191), [`context/KitchenContext.tsx:160-192`](file:///c:/Users/Tmoon/NewImproved/context/KitchenContext.tsx#L160-L192) | Replaced destructive `DELETE` + `INSERT` pantry sync with in-place row reconciliation (`FOR UPDATE` preserving `pantry.id`), and moved `PUT /api/data/meal-plan` to an abortable `useEffect`. |
| **V-08** | Rate Limiting, CORS & Open Redirect | **Medium** | ✅ Remediated | [`server/index.js:16`](file:///c:/Users/Tmoon/NewImproved/server/index.js#L16), [`server/routes/api.js:1190`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L1190), [`server/routes/stripe.js:83-100`](file:///c:/Users/Tmoon/NewImproved/server/routes/stripe.js#L83-L100) | Enabled `app.set('trust proxy', 1)` in `server/index.js`, protected `GET /api/ai/models` with auth + rate limiter, and validated Stripe redirect origins via `resolveSafeOrigin`. |
| **V-09** | External Boundary Fault Tolerance | **Medium** | ✅ Remediated | [`server/middleware/auth.js:61-99`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L61-L99), [`server/routes/api.js:238-305`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L238-L305) | Added 15-minute TTL cache and `AbortSignal.timeout(4000)` to Auth0 `/userinfo` lookups; added single-flight `modelResolutionPromise` memoization to `resolveModel()`. |
| **V-10** | Regression / Broken Maintenance Scripts | **Low** | ✅ Remediated | [`context/KitchenContext.tsx:335-365`](file:///c:/Users/Tmoon/NewImproved/context/KitchenContext.tsx#L335-L365), [`scripts/make_admin.js`](file:///c:/Users/Tmoon/NewImproved/scripts/make_admin.js), [`server/debug_credits.js`](file:///c:/Users/Tmoon/NewImproved/server/debug_credits.js) | Updated `deductPantryIngredients` to match via `cleanIngredientNameAndUnit(...).canonicalKey`, and migrated CLI scripts from legacy synchronous `db.prepare()` to async `db.query()`. |

---

## 3. Deep-Dive Findings & Pivots

### Finding V-01: Hardcoded Production PostgreSQL Credentials in Git-Tracked `query.js` & Incomplete `.gitignore`
- **Mechanism / Failure Mode:**
  A diagnostic script ([`query.js`](file:///c:/Users/Tmoon/NewImproved/query.js)) committed to the repository root contains a hardcoded Render PostgreSQL connection string with live credentials. Furthermore, [`.gitignore`](file:///c:/Users/Tmoon/NewImproved/.gitignore#L13) only excludes `*.local`, meaning a standard `.env` file created during deployment or local testing—as well as [`data/kitchensync.db`](file:///c:/Users/Tmoon/NewImproved/data/kitchensync.db)—is tracked by Git.
- **Evidence / Reproduction Trace:**
  - [`query.js`](file:///c:/Users/Tmoon/NewImproved/query.js#L1-L6):
    ```javascript
    const { Pool } = require('pg');

    const pool = new Pool({
      connectionString: 'postgresql://meal_engine_db_final_25wm_user:6WqlohUpgwjSKPJujXgpMmwHN80bOcWX@dpg-d3g7hgffte5s73bst2dg-a.oregon-postgres.render.com/meal_engine_db_final_25wm',
      ssl: { rejectUnauthorized: false }
    });
    ```
  - [`.gitignore`](file:///c:/Users/Tmoon/NewImproved/.gitignore#L10-L14):
    ```gitignore
    node_modules
    dist
    dist-ssr
    *.local
    ```
- **Architectural Pivot (Remediation):**
  1. Immediately rotate the PostgreSQL database password in the Render dashboard and update `DATABASE_URL` in Render environment settings.
  2. Remove the hardcoded URI from [`query.js`](file:///c:/Users/Tmoon/NewImproved/query.js) (or delete `query.js` and `data/kitchensync.db` via `git rm --cached`) and harden [`.gitignore`](file:///c:/Users/Tmoon/NewImproved/.gitignore):
     ```javascript
     // query.js
     require('dotenv').config({ path: '.env.local' });
     require('dotenv').config();
     const { Pool } = require('pg');

     if (!process.env.DATABASE_URL) {
       console.error('Missing DATABASE_URL environment variable.');
       process.exit(1);
     }
     const pool = new Pool({ connectionString: process.env.DATABASE_URL });
     ```
     ```gitignore
     # .gitignore additions
     .env
     .env.*
     !.env.template
     !.env.auth0_template
     *.db
     *.sqlite*
     ```

---

### Finding V-02: Unauthenticated Read/Write Household Cloud Sync & Account Enumeration (`/api/data/hub-sync`)
- **Mechanism / Failure Mode:**
  [`GET /api/data/hub-sync`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L111-L126) and [`POST /api/data/hub-sync`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L129-L218) are registered **before** `router.use(requireAuth)` ([`server/routes/data.js:220`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L220)). The helper [`resolveHubHousehold(rawCode)`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L8-L37) resolves an account if the supplied `code` matches **any** of:
  1. `UPPER(u.invite_code) = UPPER($1)` (only 3 random bytes = 6 hex chars generated in [`server/middleware/auth.js:5`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L5)),
  2. `LOWER(u.email) = LOWER($1)` (a user's known email address), or
  3. `u.household_id = $1` (which defaults to the stringified integer `user.id`).
  Because neither authentication nor rate limiting is applied, knowing a target's email address or guessing an invite code grants full read/write access to their recipes, pantry inventory, meal plan, and user metadata.
- **Evidence / Reproduction Trace:**
  - [`server/routes/data.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L8-L22):
    ```javascript
    async function resolveHubHousehold(rawCode) {
        const code = String(rawCode || '').trim();
        if (!code) return null;

        const { rows } = await db.query(
            `SELECT u.*,
                    (SELECT COUNT(*) FROM recipes r WHERE r.user_id = u.id) AS recipe_count
             FROM users u
             WHERE UPPER(u.invite_code) = UPPER($1)
                OR LOWER(u.email) = LOWER($1)
                OR u.household_id = $1
             ORDER BY recipe_count DESC, u.created_at ASC
             LIMIT 1`,
            [code]
        );
    ```
- **Architectural Pivot (Remediation):**
  1. Increase invite/sync token entropy to at least 128 bits (`'KS-' + crypto.randomBytes(16).toString('hex').toUpperCase()`), or issue a dedicated `hub_sync_token` generated from an authenticated session.
  2. Remove `OR LOWER(u.email) = LOWER($1)` and `OR u.household_id = $1` from [`resolveHubHousehold`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L16-L18) so only high-entropy secret codes can authenticate a Hub sync.
  3. Apply a strict `express-rate-limit` middleware (`max: 15` per 15-minute window, with failed lookup penalty) to `/api/data/hub-sync`.

---

### Finding V-03: Unsigned JWT (`alg: "none"`) Dev Bypass, Hardcoded `admin` Auto-Upgrade & Partial-Auth Passthrough
- **Mechanism / Failure Mode:**
  Three authentication weaknesses compound in [`server/middleware/auth.js`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js):
  1. Line 176 checks `if (process.env.NODE_ENV !== 'production' && authHeader && authHeader.startsWith('Bearer eyJhbGciOiJub25lIi'))`. If a deployment environment sets `NODE_ENV=staging` or leaves `NODE_ENV` undefined, any client can forge an unsigned token with arbitrary `sub` and `email` claims.
  2. Line 105 checks `const isAdmin = auth0Id === 'admin'` and auto-provisions `subscription_tier = 'pro'` and `9999` credits.
  3. Lines 149–156 set `req.user = req.auth` when database lookup/JIT provisioning fails or when `payload.sub` is missing. Because [`requireAuth`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L207-L210) only checks `if (!req.user)`, the request passes authentication with `req.user.id === undefined` and `req.user.effective_household === undefined`.
- **Evidence / Reproduction Trace:**
  - [`server/middleware/auth.js`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L149-L156):
    ```javascript
            } else {
                req.authLog.push("Final resolution: User is null.");
                req.user = req.auth;
            }
        } else {
            req.authLog.push("No sub in token.");
            req.user = req.auth;
        }
    ```
  - [`server/middleware/auth.js`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L207-L210):
    ```javascript
    const requireAuth = (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        next();
    };
    ```
- **Architectural Pivot (Remediation):**
  ```javascript
  // server/middleware/auth.js
  // 1. Require explicit opt-in for local dev unsigned tokens:
  const allowDevTokens =
      process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_DEV_TOKENS === 'true';

  // 2. Never assign unverified/unresolved req.auth to req.user:
  if (!user) {
      req.user = null;
  }

  // 3. Enforce valid numeric user.id in requireAuth:
  const requireAuth = (req, res, next) => {
      if (!req.user || !req.user.id) {
          return res.status(401).json({ error: "Unauthorized" });
      }
      next();
  };
  ```

---

### Finding V-04: Residual TOCTOU in `/api/credits/consume` & Unconditional Credit Refund Inflation in AI Error Handlers
- **Mechanism / Failure Mode:**
  1. **Residual TOCTOU (`POST /api/credits/consume`):** While the Gemini endpoints were updated to use `UPDATE users SET credits = credits - $1 WHERE id = $2 AND credits >= $1`, [`POST /api/credits/consume`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L223-L227) still reads `user.credits` into memory and runs an unguarded `UPDATE users SET credits = credits - $1 WHERE id = $2`. Concurrent requests bypass the credit floor.
  2. **Unconditional Refund Inflation:** In `/generate-recipe`, `/generate-image`, `/chat`, `/ai/parse-url`, `/ai/analyze-receipt`, and `/ai/scan-pantry`, the `catch (error)` block executes `UPDATE users SET credits = credits + $1 WHERE id = $2` without verifying whether the pre-flight deduction query actually ran. Furthermore, `/generate-recipe` ([`server/routes/api.js:314-315`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L314-L315)) accepts `creditCost` directly from `req.body.cost`. If an error occurs after deduction with a malformed prompt or before deduction completes, the refund logic can be abused or misfire.
- **Evidence / Reproduction Trace:**
  - [`server/routes/api.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L223-L227):
    ```javascript
    if (user.credits >= amount) {
        // Transaction
        await db.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [amount, user.id]);
        const updatedCredits = user.credits - amount;
        return res.json({ success: true, remaining: updatedCredits, tier: user.subscriptionTier });
    }
    ```
  - [`server/routes/api.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L373-L384):
    ```javascript
    } catch (error) {
        console.error("Gemini API Error:", error);
        
        // Refund credit on failure
        if (req.user) {
            const userParams = await getUser(req);
            if (userParams && userParams.subscriptionTier !== 'pro') {
                 await db.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [creditCost, req.user.id]);
            }
        }
    ```
- **Architectural Pivot (Remediation):**
  1. Make `/api/credits/consume` atomic and bound `amount`:
     ```javascript
     if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
         return res.status(400).json({ error: "Invalid credit amount." });
     }
     const deduct = await db.query(
         'UPDATE users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits',
         [amount, user.id]
     );
     if (deduct.rowCount === 0) {
         return res.status(402).json({ error: "Insufficient credits" });
     }
     ```
  2. Track `let creditDeducted = false;` in every AI route handler, set `creditDeducted = true` **only** after `deductResult.rowCount > 0`, cap `creditCost` to `[1, 5]`, and gate the `catch` refund behind `if (creditDeducted && req.user?.id)`.

---

### Finding V-05: SSRF Redirect Bypass, Incomplete Private IP Filtering & Unbounded Response Buffering in `/api/ai/parse-url`
- **Mechanism / Failure Mode:**
  [`fetchSingleUrlInsights`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L690-L743) uses `redirect: 'follow'` when fetching user-supplied URLs. If an external URL responds with a `301`/`302` redirect to an internal address (e.g., `http://169.254.169.254/latest/meta-data/` or `http://127.0.0.1:3001/api/auth/diagnostics`), `fetch` automatically requests the internal target. Line 705 (`if (pageResponse.url && isSafePublicUrl(pageResponse.url).ok)`) only conditionally updates `finalUrl`—it **does not abort**, allowing line 711 (`rawHtml = await pageResponse.text()`) to read the internal response and send it to Gemini. In addition, [`isSafePublicUrl`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L523-L546) does not resolve DNS (`dns.lookup`) to prevent DNS rebinding, misses bracketed IPv6 (`[::1]`, `[::ffff:127.0.0.1]`), and buffers the entire response body in memory prior to truncation.
- **Evidence / Reproduction Trace:**
  - [`server/routes/api.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L696-L712):
    ```javascript
    const pageResponse = await fetch(targetUrl, {
        redirect: 'follow',
        headers: { ... },
        signal: AbortSignal.timeout(10000)
    });
    if (pageResponse.url && isSafePublicUrl(pageResponse.url).ok) {
        finalUrl = pageResponse.url;
    }
    if (!pageResponse.ok) {
        blockedOrEmpty = true;
    } else {
        rawHtml = await pageResponse.text();
    ```
- **Architectural Pivot (Remediation):**
  1. Resolve hostnames via `dns.promises.lookup(hostname, { all: true })` and block loopback, link-local, RFC1918, carrier-grade NAT (`100.64.0.0/10`), and IPv6 unique-local/loopback (`::1`, `fc00::/7`, `fe80::/10`, `::ffff:127.0.0.0/104`).
  2. Use `redirect: 'manual'`, validate each `Location` header with `isSafePublicUrl` + DNS check (up to 3 hops), and stream the response body with a strict 2 MB byte ceiling.

---

### Finding V-06: Process Termination SPOF on Idle PostgreSQL Error & Unverified TLS
- **Mechanism / Failure Mode:**
  [`server/db.js:12-15`](file:///c:/Users/Tmoon/NewImproved/server/db.js#L12-L15) attaches an `'error'` listener to the PostgreSQL connection pool that executes `process.exit(-1)`. Whenever Render PostgreSQL recycles an idle connection or performs brief maintenance, `pg.Pool` emits `'error'` for the idle client, crashing the entire Node.js server and dropping all active requests. Additionally, line 9 sets `ssl: isLocalhost ? false : { rejectUnauthorized: false }`, disabling certificate verification.
- **Evidence / Reproduction Trace:**
  - [`server/db.js`](file:///c:/Users/Tmoon/NewImproved/server/db.js#L6-L15):
    ```javascript
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost/kitchensync',
        ssl: isLocalhost ? false : { rejectUnauthorized: false }
    });

    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
    });
    ```
- **Architectural Pivot (Remediation):**
  Remove `process.exit(-1)` so `pg.Pool` can evict the disconnected idle client and transparently establish a new connection on the next query, and add explicit pool timeouts:
  ```javascript
  const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/kitchensync',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: isLocalhost
          ? false
          : {
                rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
                ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {})
            }
  });

  pool.on('error', (err) => {
      console.error('[Postgres Pool] Idle client error (client evicted automatically):', err.message);
  });
  ```

---

### Finding V-07: Lost-Update Concurrency Collisions on Monolithic `meal_plans` JSONB & Pantry Primary-Key Churn
- **Mechanism / Failure Mode:**
  1. **Monolithic `meal_plans` Overwrites:** [`PUT /api/data/meal-plan`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L482-L497) and [`POST /api/data/hub-sync`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L152-L160) overwrite the entire `meal_plans.data` JSONB blob without checking `updated_at` or merging slots. On the client, [`KitchenContext.tsx:160-174`](file:///c:/Users/Tmoon/NewImproved/context/KitchenContext.tsx#L160-L174) fires unawaited `PUT /api/data/meal-plan` requests from *inside* the React state updater (`setMealPlanState(prev => ...)`), meaning rapid clicks can resolve out of order at the database.
  2. **Pantry Primary-Key Churn:** [`POST /api/data/hub-sync`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L162-L191) deletes all household pantry rows (`DELETE FROM pantry WHERE user_id IN (...)`) and re-inserts them on every Hub sync. This reassigns every pantry row a brand-new `SERIAL` `id` and forces `user_id` to a single user, breaking in-flight `PUT /api/data/pantry/:id` or `DELETE /api/data/pantry/:id` calls from web/mobile clients.
- **Evidence / Reproduction Trace:**
  - [`server/routes/data.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L166-L174):
    ```javascript
    await client.query(
        'DELETE FROM pantry WHERE user_id IN (SELECT id FROM users WHERE household_id = $1 OR (household_id IS NULL AND id::text = $1))',
        [effectiveHousehold]
    );
    for (const item of pantry) {
        if (!item.name || Number(item.quantity) <= 0) continue;
        await client.query(
            'INSERT INTO pantry (user_id, name, quantity, unit, category, expiry_date) VALUES ($1, $2, $3, $4, $5, $6)',
    ```
- **Architectural Pivot (Remediation):**
  1. In [`POST /api/data/hub-sync`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L162-L191), preserve existing pantry row IDs via `INSERT INTO pantry (id, user_id, ...) ON CONFLICT (id) DO UPDATE ...` (and only delete IDs explicitly removed), or reconcile by `(LOWER(name), unit)` in place.
  2. Move the `PUT /api/data/meal-plan` network call out of the `setMealPlanState` pure state updater in [`KitchenContext.tsx`](file:///c:/Users/Tmoon/NewImproved/context/KitchenContext.tsx#L160-L174) into a debounced `useEffect` or serialized queue with an `AbortController`.

---

### Finding V-08: Missing `trust proxy` Configuration on Render, Unauthenticated `/api/ai/models` & Unvalidated Stripe Redirect Origin
- **Mechanism / Failure Mode:**
  1. [`server/index.js`](file:///c:/Users/Tmoon/NewImproved/server/index.js) does not set `app.set('trust proxy', 1)`. Behind Render's load balancer, `req.ip` is the internal proxy address rather than the client IP, causing [`aiRateLimiter`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L10-L16) (`10 req/min`) to rate-limit **all** users globally in a single shared bucket.
  2. [`GET /api/ai/models`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L1087-L1114) has neither `requireAuth` nor `aiRateLimiter`.
  3. [`server/routes/stripe.js:97, 133`](file:///c:/Users/Tmoon/NewImproved/server/routes/stripe.js#L97-L111) interpolates `const origin = req.headers.origin || 'http://localhost:5173'` directly into `success_url`, `cancel_url`, and `return_url` without validating against an allowlist of trusted origins.
- **Evidence / Reproduction Trace:**
  - [`server/routes/stripe.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/stripe.js#L97-L110):
    ```javascript
    const origin = req.headers.origin || 'http://localhost:5173'; // fallback for local dev
    const session = await stripe.checkout.sessions.create({
        ...
        success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/#/profile`,
    ```
- **Architectural Pivot (Remediation):**
  1. Add `app.set('trust proxy', 1);` in [`server/index.js`](file:///c:/Users/Tmoon/NewImproved/server/index.js#L12) and key `aiRateLimiter` by `req.user?.id || req.ip`.
  2. Add `requireAuth, aiRateLimiter` to `GET /api/ai/models`.
  3. Replace `req.headers.origin` in [`server/routes/stripe.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/stripe.js#L97) with a configured `process.env.APP_BASE_URL` allowlist check.

---

### Finding V-09: Unbounded Blocking `/userinfo` Fetch in Auth Middleware Hot Path & Concurrent Cold-Start Model Listing
- **Mechanism / Failure Mode:**
  In [`server/middleware/auth.js:51-77`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L51-L77), whenever an Auth0 access token does not embed the `email` claim (standard for custom API audiences unless a custom Action adds it) and the user record has `@auth0.placeholder`, `populateUser` executes a blocking `await fetch(userInfoUrl)` on **every incoming API request** without an `AbortSignal.timeout` or negative cache. Because the frontend fires 5 parallel API requests on mount (`/api/user/profile`, `/api/data/recipes`, `/api/data/pantry`, `/api/data/shopping`, `/api/data/meal-plan`), this triggers 5 simultaneous `/userinfo` requests to Auth0, hitting Auth0's strict `/userinfo` rate limit (`429`) and adding hundreds of milliseconds of latency to every request.
- **Evidence / Reproduction Trace:**
  - [`server/middleware/auth.js`](file:///c:/Users/Tmoon/NewImproved/server/middleware/auth.js#L51-L59):
    ```javascript
    if (!email && req.headers['authorization'] && !req.headers['authorization'].includes('eyJhbGciOiJub25lIi')) {
        req.authLog.push("Email missing in token. Fetching /userinfo...");
        try {
            const baseUrl = process.env.AUTH0_ISSUER_BASE_URL.replace(/\/$/, '');
            const userInfoUrl = `${baseUrl}/userinfo`;
            const userRes = await fetch(userInfoUrl, {
                headers: { Authorization: req.headers['authorization'] }
            });
    ```
- **Architectural Pivot (Remediation):**
  Cache `/userinfo` lookups (including negative results) in a `Map` keyed by `auth0Id` with a 15-minute TTL, and enforce `signal: AbortSignal.timeout(3500)` on the `fetch` call. Similarly, memoize the in-flight promise in [`resolveModel()`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L240-L305) (`let modelResolutionPromise = null`).

---

### Finding V-10: Canonical Key Regression in `deductPantryIngredients` & Legacy Synchronous `db.prepare()` Calls in CLI Scripts
- **Mechanism / Failure Mode:**
  1. **Pantry Deduction Mismatch:** While [`pages/ShoppingList.tsx:132-143`](file:///c:/Users/Tmoon/NewImproved/pages/ShoppingList.tsx#L132-L143) uses `cleanIngredientNameAndUnit` (`canonicalKey`) to match Pantry items against Recipe ingredients, [`deductPantryIngredients`](file:///c:/Users/Tmoon/NewImproved/context/KitchenContext.tsx#L324-L326) still uses strict lowercase string equality (`p.name.toLowerCase() === ing.name.toLowerCase()`). If the Pantry contains `"Eggs"` and a Recipe calls for `"Large Egg"`, the Shopping List recognizes the user has eggs, but clicking **"Mark Cooked"** fails to deduct them from the Pantry.
  2. **Broken Maintenance Scripts:** [`scripts/make_admin.js:12, 20`](file:///c:/Users/Tmoon/NewImproved/scripts/make_admin.js#L12-L20) and [`server/debug_credits.js:8-22`](file:///c:/Users/Tmoon/NewImproved/server/debug_credits.js#L8-L22) call `db.prepare(...).get()` (from the retired `better-sqlite3` driver) on the PostgreSQL `pg.Pool` exported by [`server/db.js`](file:///c:/Users/Tmoon/NewImproved/server/db.js), throwing `TypeError: db.prepare is not a function`.
- **Evidence / Reproduction Trace:**
  - [`context/KitchenContext.tsx`](file:///c:/Users/Tmoon/NewImproved/context/KitchenContext.tsx#L323-L327):
    ```typescript
    ingredients.forEach(ing => {
        const pantryItemIndex = nextPantry.findIndex(
            p => p.name.toLowerCase() === ing.name.toLowerCase()
        );
    ```
  - [`scripts/make_admin.js`](file:///c:/Users/Tmoon/NewImproved/scripts/make_admin.js#L12):
    ```javascript
    const user = db.prepare('SELECT id, username, email, subscription_tier FROM users WHERE email = ? OR username = ?').get(email, email);
    ```
- **Architectural Pivot (Remediation):**
  1. Update [`deductPantryIngredients`](file:///c:/Users/Tmoon/NewImproved/context/KitchenContext.tsx#L323-L330) to match by `cleanIngredientNameAndUnit(p.name, p.unit).canonicalKey === cleanIngredientNameAndUnit(ing.name, ing.unit).canonicalKey`.
  2. Convert [`scripts/make_admin.js`](file:///c:/Users/Tmoon/NewImproved/scripts/make_admin.js) and [`server/debug_credits.js`](file:///c:/Users/Tmoon/NewImproved/server/debug_credits.js) to async `await db.query(...)` with `$1` placeholders, and remove unused `better-sqlite3`, `bcrypt`, `jsonwebtoken`, and `cookie-parser` dependencies from [`package.json`](file:///c:/Users/Tmoon/NewImproved/package.json#L26-L36).

---

## 4. Completed Task Verifications ("Five Whys")

The following Moderate/High complexity features previously marked as **COMPLETED** in [`AUDIT_REPORT.md`](file:///c:/Users/Tmoon/NewImproved/AUDIT_REPORT.md), [`SECURITY_REPORT.md`](file:///c:/Users/Tmoon/NewImproved/SECURITY_REPORT.md), and recent project milestones were subjected to an adversarial "Five Whys" failure simulation.

### Task 1: Pre-Flight Atomic Credit Deduction & AI Rate Limiting
- **Declared Status:** Completed ([`SECURITY_REPORT.md`](file:///c:/Users/Tmoon/NewImproved/SECURITY_REPORT.md#L21-L38), [`test_concurrency.js`](file:///c:/Users/Tmoon/NewImproved/test_concurrency.js#L1-L57)).
- **Failure Simulation Question:** *"Under what inputs or sequence of actions can a non-Pro user still bypass credit limits or inflate their credit balance?"*
  1. **Why can a user inflate their credit balance or bypass limits?** Because [`POST /api/credits/consume`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L208-L235) was left with a non-atomic `SELECT` then `UPDATE`, and the six AI endpoints in [`server/routes/api.js`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L373-L384) execute an unconditional `UPDATE users SET credits = credits + $1` inside their `catch` blocks whenever `req.user` is present.
  2. **Why does the `catch` block refund unconditionally?** Because no boolean state flag (`creditDeducted`) tracks whether the pre-flight `UPDATE ... WHERE credits >= $1` query actually succeeded before an exception was thrown.
  3. **Why can an exception be thrown or amplified before/after deduction?** Because `/generate-recipe` reads `creditCost` from client-supplied `req.body.cost` ([`server/routes/api.js:314`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L314)), and in `/ai/analyze-receipt` ([`line 1042`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L1042)) or `/ai/scan-pantry` ([`line 1160`](file:///c:/Users/Tmoon/NewImproved/server/routes/api.js#L1160)), `image.split(',')[1]` is evaluated *after* deduction without validating `typeof image === 'string'`.
  4. **Why did `test_concurrency.js` pass despite these gaps?** Because [`test_concurrency.js`](file:///c:/Users/Tmoon/NewImproved/test_concurrency.js#L13-L29) tested the isolated SQL query string in a standalone script rather than exercising the Express HTTP routes (`/api/credits/consume` and `/api/generate-recipe`) with adversarial payloads.
  5. **Root Invariant Violated:** Credit mutations must be encapsulated in a single server-authoritative helper (`withCreditTransaction(userId, fixedCost, fn)`) where costs are defined by the server route—never `req.body.cost`—and refunds occur strictly if and only if the pre-flight atomic deduction committed.

### Task 2: Smart Unit Conversion & Canonical Ingredient Normalization ("Golden Logic")
- **Declared Status:** Completed ([`AUDIT_REPORT.md`](file:///c:/Users/Tmoon/NewImproved/AUDIT_REPORT.md#L14-L19), [`pages/ShoppingList.tsx`](file:///c:/Users/Tmoon/NewImproved/pages/ShoppingList.tsx#L52-L217), [`utils/ingredientNormalizer.ts`](file:///c:/Users/Tmoon/NewImproved/utils/ingredientNormalizer.ts)).
- **Failure Simulation Question:** *"Under what sequence of actions does the Pantry ↔ Shopping List 'Golden Logic' desynchronize after a user cooks a meal?"*
  1. **Why does the Pantry fail to deduct ingredients when a user marks a meal as 'Cooked'?** Because [`deductPantryIngredients`](file:///c:/Users/Tmoon/NewImproved/context/KitchenContext.tsx#L317-L362) in `KitchenContext.tsx` looks up Pantry items using `p.name.toLowerCase() === ing.name.toLowerCase()` instead of `cleanIngredientNameAndUnit(...).canonicalKey`.
  2. **Why does strict lowercase matching fail when `ShoppingList.tsx` succeeds?** Because `ShoppingList.tsx` normalizes `"Large Egg"` and `"Eggs"` to the canonical key `"egg"`, whereas `deductPantryIngredients` compares `"eggs" === "large egg"` (`false`) and treats the item as missing from the Pantry.
  3. **Why does unit conversion inside `deductPantryIngredients` also fail on size-qualified units?** Because if a Pantry item has `unit: "large"` or `unit: "cans"`, `ShoppingList.tsx` cleans the unit via `cleanIngredientNameAndUnit`, whereas `deductPantryIngredients` passes raw `pantryItem.unit` directly to `convertQuantity`.
  4. **Why were `ShoppingList.tsx` and `KitchenContext.tsx` out of sync?** Because normalization was applied to the read/aggregation projection (`ShoppingList.tsx`) without updating the write/deduction mutation path (`deductPantryIngredients` in `KitchenContext.tsx`).
  5. **Root Invariant Violated:** Both halves of the Golden Logic—**Shopping List Aggregation (Read)** and **Cooking Pantry Deduction (Write)**—must share the exact same canonical key and unit normalization pipeline (`cleanIngredientNameAndUnit`).

### Task 3: 2-Way KitchenSync Cloud ↔ Family Hub Sync
- **Declared Status:** Completed ([`server/routes/data.js:110-218`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L110-L218)).
- **Failure Simulation Question:** *"What happens when the Family Hub runs its 60-second background sync while a family member edits their Pantry or Meal Plan on their phone?"*
  1. **Why do concurrent mobile edits to the Pantry or Meal Plan disappear or return `404`?** Because `POST /api/data/hub-sync` executes a full `DELETE FROM pantry` followed by `INSERT INTO pantry` ([`lines 166-183`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L166-L183)) and a blind `ON CONFLICT (household_id) DO UPDATE SET data = EXCLUDED.data` on `meal_plans` ([`lines 153-159`](file:///c:/Users/Tmoon/NewImproved/server/routes/data.js#L153-L159)).
  2. **Why does `DELETE` + `INSERT` break concurrent web/mobile Pantry edits?** Because every 60-second Hub sync destroys all existing `pantry.id` serial primary keys and generates new ones; the mobile client holding the previous `pantry.id` sends `PUT /api/data/pantry/:id`, which now fails with `404 Pantry item not found`.
  3. **Why was `DELETE` + `INSERT` used instead of row-level upserts?** Because the Family Hub maintains its own local SQLite `kitchen_pantry` table with local integer IDs that do not match PostgreSQL's `pantry.id` sequence.
  4. **Why was `/api/data/hub-sync` also exposed without `requireAuth`?** Because the kiosk appliance does not hold an interactive Auth0 browser session, so lookup by Invite Code or Email was used as a shortcut for device pairing.
  5. **Root Invariant Violated:** Device-to-cloud synchronization requires a dedicated high-entropy device token (paired once via an authenticated user action) and idempotent merge/upsert semantics keyed by canonical item identity or `updated_at` timestamps rather than destructive table replacement.
