# HIGH-IMPACT FEATURE EXPANSION PROPOSAL
**Execution Date:** 2026-11-01
**Target Product / Workspace:** KitchenSync (`c:\Users\Tmoon\NewImproved`)
**Core Product Leap:** Transform KitchenSync from a manual recipe and meal-slot tracker into an autonomous, multi-modal culinary operating system with zero-credit smart scheduling, cookbook/card vision OCR, predictive pantry expiry & macro intelligence, iCal/deep-link ecosystem interoperability, hands-free voice/timer cooking, and interactive diff-based AI steering.

---

## 1. Feature Leverage Matrix

| Priority | Feature Concept | Category Vector | Tier | User Workflow Impact | Complexity (S/M/L) | Moat / Differentiation Score (High/Med) |
|---|---|---|---|---|---|---|
| **F-01** | **1-Click "Smart Auto-Fill Week" & Canonical Pantry Match Scorer** | Vector A: Workflow Compression & Autonomy | **Tier 1** (Immediate Differentiator) | Compresses 15-step manual drag-and-drop planning into a `<10ms`, `0-credit` 1-click auto-scheduler that prioritizes expiring pantry items, favorites, and canonical ingredient overlap (`0–100%` match score). | **S** | **High** |
| **F-02** | **Interactive AI Remix Diff Inspector, Live Serving Scaler & Staging Undo Stack** | Vector E: Feedback Loops & Collaborative Multipliers | **Tier 1** (Immediate Differentiator) | Replaces raw `JSON.stringify` in `RecipeDetail.tsx` with a visual ingredient/macro diff card, adds live `0.5x–4x` serving scaling with 1-click shopping list push, and adds staging review + undo rollback for Fridge Scans & Planner edits. | **S** | **High** |
| **F-03** | **Predictive Pantry Expiry Radar, Shelf-Life Heuristics & Weekly Macro/Diet Bar** | Vector C: Intelligence & Analytical Depth | **Tier 1** (Immediate Differentiator) | Surfaces `expiryDate` warnings (`Expiring ≤3d` / `Expired`), auto-infers category shelf-life on add, provides 1-click "Rescue Expiring Items" recipe filtering, and synthesizes daily Calories/Protein/Carbs/Fat + household dietary alerts in `MealPlanner.tsx`. | **M** | **High** |
| **F-04** | **Hands-Free Voice Cooking Mode & Auto-Extracted Multi-Step Timers** | Vector A: Workflow Compression & Autonomy | **Tier 1** (Immediate Differentiator) | Auto-parses durations (`"25 mins"`, `"1 hr"`) from step text in `CookingMode.tsx` into concurrent interactive countdown timers with audio alerts, plus Web Speech API voice navigation (`"Next"`, `"Back"`, `"Repeat"`, `"Timer"`). | **S** | **High** |
| **F-05** | **Multi-Modal Recipe Ingestion (Cookbook/Card Vision OCR, Bulk Text Parser & Full Recipe Editor)** | Vector B: Ingestion & Surface Area Expansion | **Tier 2** (Flagship Capability) | Adds camera/photo OCR (`/api/ai/scan-recipe-image`) for physical cookbooks & handwritten cards, zero-credit bulk ingredient/step text pasting, and full recipe editing (`/recipes/:id/edit`) in `RecipeForm.tsx`. | **M** | **High** |
| **F-06** | **Ecosystem Interoperability Hub (iCal `.ics` Calendar Feed, Store Search Deep-Links & Cookbook JSON/MD Backup)** | Vector D: Interoperability & Ecosystem Multiplication | **Tier 2** (Flagship Capability) | Exports scheduled meals to Apple/Google/Outlook Calendar (`.ics`), upgrades `GroceryExportModal.tsx` with direct store item-search deep-links + native mobile share (`navigator.share`), and adds portable Cookbook `.json`/`.md` import/export. | **M** | **High** |

---

## 2. Feature Architecture Blueprints

### Feature F-01: 1-Click "Smart Auto-Fill Week" & Canonical Pantry Match Scorer
- **Current User Friction / Capability Gap:**
  1. In `Dashboard.tsx`, `Recipes.tsx`, and `MealPlanner.tsx`, recipe cookability (`recipesCanMake`) relies on brittle exact string matching (`pantryItemNames.has(ing.name.toLowerCase())`). If a recipe calls for `"Yellow Onion"` while the pantry holds `"Onion"`, or if a user has 8 of 9 ingredients, the recipe is treated as `0%` makeable.
  2. Populating a weekly schedule requires either dragging 7–21 meals slot by slot or configuring a 10-field form on `/ai-architect` and spending 1–5 AI credits.
- **The Capability Leap:**
  - **Canonical Pantry Match Scorer:** Computes an exact `0–100%` Pantry Match score for every recipe using the isomorphic canonical key engine (`cleanIngredientNameAndUnit`), surfacing `"100% Ready"`, `"80% Match • Missing 1"`, and `"Uses Expiring Item"` badges across `RecipeCard.tsx`, `Recipes.tsx`, and `MealPlanner.tsx`.
  - **1-Click Smart Auto-Fill (`0 Credits`, `<10ms`):** A single button in `MealPlanner.tsx` deterministically populates all active unscheduled slots (or the flexible weekly pick-list) by scoring candidate recipes across expiring pantry item usage (`+40`), Pantry Match % (`+0..35`), favorite status (`+15`), star rating (`+0..10`), and slot meal-type fit (`+15`), with a `-60` repeat penalty to guarantee variety.
- **Technical Specification & Data Contract:**
  - **Input / Output Schema:**
    ```ts
    export interface PantryMatchResult {
      matchPercentage: number;       // 0..100
      matchedCount: number;
      totalCount: number;
      missingIngredients: Ingredient[];
      usesExpiringItem: boolean;
      expiringMatchedNames: string[];
    }
    ```
  - **Service / Engine Integration:** Implemented in [`shared/culinaryEngines.mjs`](file:///c:/Users/Tmoon/NewImproved/shared/culinaryEngines.mjs) and re-exported via [`utils/pantryMatcher.ts`](file:///c:/Users/Tmoon/NewImproved/utils/pantryMatcher.ts).
  - **Proof-of-Concept Handler Skeleton:**
    ```js
    export const scoreRecipeAgainstPantry = (recipe, pantry = [], nowMs = Date.now()) => {
      const ings = (recipe?.ingredients || []).filter(i => i?.name && !isPlainCookingWater(i.name));
      if (ings.length === 0) return { matchPercentage: 100, matchedCount: 0, totalCount: 0, missingIngredients: [], usesExpiringItem: false, expiringMatchedNames: [] };
      // Canonical key index + expiring item detection (<= 3 days)
      // Returns deterministic match metrics in O(N) time
    };
    ```
- **Verification & Acceptance Criteria:**
  - `node --test` verifies that `"Yellow Onions, chopped"` in a recipe matches `"Onion"` in the pantry (`100%` match) and that `generateSmartWeeklyPlan` prioritizes recipes consuming expiring pantry items without repeating meals across the week.
- **Rollout & Fallback Strategy:**
  - Non-destructive additive action in `MealPlanner.tsx` paired with a 1-click **Undo** snapshot stack so users can revert to their previous plan state immediately.

---

### Feature F-02: Interactive AI Remix Diff Inspector, Live Serving Scaler & Staging Undo Stack
- **Current User Friction / Capability Gap:**
  1. `RecipeDetail.tsx` renders AI Recipe Remixes as raw unformatted JSON (`<p>{JSON.stringify(remixResult, null, 2)}</p>`), forcing users to read raw JSON keys to see what changed.
  2. Recipes have static serving counts; users cannot scale quantities dynamically on `RecipeDetail.tsx` or `CookingMode.tsx` without burning an AI credit, nor can they push scaled missing ingredients directly to their Shopping List.
  3. Scanning a fridge photo in `Pantry.tsx` blindly inserts all AI-detected items into PostgreSQL without a staging review step.
- **The Capability Leap:**
  - **Interactive AI Remix Diff Inspector:** Replaces raw JSON output with a visual comparison card showing Calorie/Protein/Carb/Fat deltas (`-140 kcal`, `+8g Protein`), color-coded ingredient changes (`Added`, `Modified`, `Removed`), and formatted steps, allowing users to either **Save as New Recipe** or **Update Existing Recipe**.
  - **Live Serving Scaler & 1-Click Missing Item Push:** Interactive `-` / `+` and `0.5x / 1x / 2x / 3x` controls on `RecipeDetail.tsx` and `CookingMode.tsx` scale all ingredients through `standardizeMeasurement` (snapping to clean culinary fractions) and let users push missing scaled items directly to the Shopping List.
  - **Vision Scan Staging Modal & Planner Undo Stack:** Fridge/Pantry photo scans open an interactive staging checklist where quantities, units, categories, and expiry dates can be adjusted before saving.
- **Technical Specification & Data Contract:**
  - **Remix Diff Contract:**
    ```ts
    export interface RecipeDiffSummary {
      calorieDelta: number;
      proteinDelta: number;
      carbDelta: number;
      fatDelta: number;
      addedIngredients: Ingredient[];
      modifiedIngredients: Array<{ current: Ingredient; previous: Ingredient }>;
      removedIngredients: Ingredient[];
    }
    ```
  - **Proof-of-Concept Handler Skeleton:**
    ```js
    export const computeRecipeDiff = (originalRecipe, remixedRecipe) => {
      // Matches ingredients by canonicalKey via cleanIngredientNameAndUnit
      // Computes macro deltas and classifies ingredients into added, modified, and removed
    };
    ```
- **Verification & Acceptance Criteria:**
  - Scaling a 4-serving recipe to 6 servings scales `0.5 cup` to `3/4 cup` (`0.75`) and `2 eggs` to `3 eggs`.
  - Remixing a recipe renders the visual Diff Card with zero raw JSON strings exposed.
- **Rollout & Fallback Strategy:**
  - Serving scaler defaults to `recipe.servings` (`1x` ratio) and does not mutate the persisted recipe unless explicitly saved in Edit Mode.

---

### Feature F-03: Predictive Pantry Expiry Radar, Shelf-Life Heuristics & Weekly Macro/Diet Bar
- **Current User Friction / Capability Gap:**
  1. `PantryItem` includes `expiryDate?: string` in `types.ts`, yet `Pantry.tsx` never renders or edits expiry dates, never infers shelf life when items are added via Quick Add or Fridge Scan, and never alerts users before food spoils.
  2. `Profile.tsx` collects `dailyCalorieGoal`, `proteinGoal`, `carbGoal`, `fatGoal`, and `householdMembers[].dietaryRestrictions`, but `MealPlanner.tsx` provides zero feedback on whether a planned day meets macro goals or violates a family member's dietary restrictions (e.g., Vegetarian, Gluten-Free, Dairy-Free, Nut Allergy).
- **The Capability Leap:**
  - **Predictive Shelf-Life Heuristics & Expiry Radar:** Automatically assigns smart category-based expiry dates when items are added without an explicit date (`Meat`/`Seafood`: 4 days, `Bakery`: 5 days, `Produce`: 7 days, `Dairy & Eggs`: 10 days, `Frozen`: 90 days, `Pantry Staples`: 180 days). Surfaces `Expired` and `Expiring ≤3d` badges in `Pantry.tsx` and `Dashboard.tsx`, plus a 1-click **"Cook Expiring Items"** filter.
  - **Daily Macro Progress & Dietary Conflict Detector:** Synthesizes daily scheduled `kcal`, `Protein`, `Carbs`, and `Fat` against user targets in `MealPlanner.tsx` and flags any scheduled recipe whose ingredients conflict with household dietary restrictions.
- **Technical Specification & Data Contract:**
  - **Shelf-Life & Dietary Check Contract:**
    ```js
    export const inferDefaultExpiryDate = (category, itemName = '', nowMs = Date.now()) => { /* ... */ };
    export const getExpiryStatus = (expiryDate, nowMs = Date.now()) => { /* returns expired | expiring_soon | fresh | none */ };
    export const checkDietaryConflicts = (recipe, householdMembers = []) => { /* returns Array<{ memberName, restriction, offendingIngredient }> */ };
    ```
- **Verification & Acceptance Criteria:**
  - Adding `"Chicken Breast"` in `Pantry.tsx` auto-populates a 4-day expiry date; items within 3 days of expiration trigger the Expiry Radar badge and are prioritized by `generateSmartWeeklyPlan`.
  - Scheduling a recipe containing `"Bacon"` for a household with a `"Vegetarian"` member surfaces an inline dietary warning badge.
- **Rollout & Fallback Strategy:**
  - Items with no `expiryDate` gracefully display `"Set Expiry"` without false-positive warnings.

---

### Feature F-04: Hands-Free Voice Cooking Mode & Auto-Extracted Multi-Step Timers
- **Current User Friction / Capability Gap:**
  - In `CookingMode.tsx`, steps such as `"Simmer for 15 minutes, then broil for 3-4 mins"` are static text. Users with messy hands must touch their phone or set external timers, and voice integration is strictly one-way (`speechSynthesis` output only).
- **The Capability Leap:**
  - **Auto-Extracted Multi-Step Timers:** Deterministically parses all duration phrases (`hours`, `minutes`, `seconds`, and ranges like `10-12 mins`) from each cooking step and renders 1-tap timer launch pills. Multiple concurrent countdown timers run in a floating dock with play/pause/reset, `+1m` extension, and a synthesized Web Audio API completion chime.
  - **Hands-Free Voice Command Listener:** Integrates Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) so chefs can say `"Next"`, `"Back"`, `"Repeat"`, or `"Start timer"` completely hands-free.
- **Technical Specification & Data Contract:**
  - **Timer Extraction Contract:**
    ```ts
    export interface ExtractedStepTimer {
      id: string;
      label: string;           // e.g., "25 min timer"
      durationSeconds: number; // e.g., 1500
      sourceMatch: string;     // e.g., "25 minutes"
    }
    ```
  - **Proof-of-Concept Handler Skeleton:**
    ```js
    export const extractStepTimers = (stepText = '') => {
      // Regex matches: (\d+(?:\.\d+)?(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b
      // Converts upper bound of range into seconds and returns deduplicated timer descriptors
    };
    ```
- **Verification & Acceptance Criteria:**
  - `extractStepTimers("Bake at 400F for 20-25 minutes, then rest for 5 mins")` deterministically returns `[{ durationSeconds: 1500, ... }, { durationSeconds: 300, ... }]`.
  - Voice recognition gracefully hides its toggle on browsers that do not implement `SpeechRecognition` / `webkitSpeechRecognition`.
- **Rollout & Fallback Strategy:**
  - Voice listening is opt-in via a header toggle in `CookingMode.tsx`; timers work universally across all desktop and mobile browsers.

---

### Feature F-05: Multi-Modal Recipe Ingestion (Cookbook/Card Vision OCR, Bulk Text Parser & Full Recipe Editor)
- **Current User Friction / Capability Gap:**
  1. `Recipes.tsx` only imports recipes from web URLs or AI text prompts. Users cannot photograph a physical cookbook page, magazine clipping, or handwritten family index card.
  2. Users who already have a recipe in plain text (e.g., copied from an email, Notes app, or PDF) cannot bulk-paste it without spending AI credits or typing each ingredient field by field.
  3. `RecipeForm.tsx` only supports creating new recipes (`/recipes/new`)—existing recipes cannot be edited!
- **The Capability Leap:**
  - **Cookbook & Recipe Card Vision OCR (`POST /api/ai/scan-recipe-image`):** Uses Gemini Vision with server-enforced `recipe` schema and canonical ingredient normalization to turn any photo of a cookbook page, handwritten card, or screenshot into a complete structured `Recipe` (scaled to `familySize`).
  - **Zero-Credit Deterministic Bulk Text Parser:** Allows users to paste raw ingredient lists or full recipe text into `RecipeForm.tsx` and deterministically parses quantities, units, canonical categories, and numbered steps in `<5ms` with `0` credits.
  - **Full Recipe Editor (`/recipes/:id/edit`):** Extends `RecipeForm.tsx` to load and update any existing recipe via `updateRecipe`.
- **Technical Specification & Data Contract:**
  - **Backend Route Contract (`POST /api/ai/scan-recipe-image`):**
    - Request: `{ image: "data:image/jpeg;base64,...", familySize?: number }`
    - Pipeline: Pre-flight `deductCredits(1)` -> `generateContentWithFailover(genAI, modelName, [prompt, imagePart], { responseMimeType: 'application/json', responseSchema: resolveServerSchema('recipe') })` -> `normalizeRecipeIngredientsList` -> automatic `refundCredits` on error.
- **Verification & Acceptance Criteria:**
  - `parseRawRecipeText` deterministically converts multi-line ingredient blocks and instruction paragraphs into normalized `Recipe` payloads in `node --test`.
  - Navigating to `/recipes/:id/edit` pre-populates `RecipeForm.tsx` and persists edits via `PUT /api/data/recipes/:id`.
- **Rollout & Fallback Strategy:**
  - If an uploaded image is unreadable, `POST /api/ai/scan-recipe-image` automatically refunds the user's credit via `credit_ledger` and surfaces a clear retry message.

---

### Feature F-06: Ecosystem Interoperability Hub (iCal `.ics` Calendar Feed, Store Search Deep-Links & Cookbook JSON/MD Backup)
- **Current User Friction / Capability Gap:**
  1. Scheduled meals in `MealPlanner.tsx` are siloed inside KitchenSync and cannot be synced to Google Calendar, Apple Calendar, or Outlook.
  2. `GroceryExportModal.tsx` copies plain text and links only to generic store homepages (`https://instacart.com`), forcing users to manually type each item into the store's search bar.
  3. Users have no way to export or import their recipe collection as portable `.json` or `.md` files.
- **The Capability Leap:**
  - **1-Click RFC-5545 `.ics` Calendar Export:** Generates a standards-compliant `.ics` file for the active week in `MealPlanner.tsx` with `VEVENT` blocks (`Breakfast` at `08:00`, `Lunch` at `12:30`, `Snack` at `15:30`, `Dinner` at `18:30`), embedding prep/cook times, macro summaries, and full ingredient checklists in the event description.
  - **Direct Store Item-Search Deep-Links & Native Web Share:** Upgrades `GroceryExportModal.tsx` with direct item-search URLs (`Instacart`, `Walmart`, `Amazon Fresh`, `Target`, `Kroger`) so clicking any shopping list item opens that store's search results directly, plus 1-tap `navigator.share` for mobile messaging/Notes.
  - **Portable Cookbook `.json` & `.md` Backup / Restore:** Adds 1-click Cookbook Export (`.json` and print-ready `.md`) and Cookbook JSON Import in `Recipes.tsx`.
- **Technical Specification & Data Contract:**
  - **iCalendar Generator & Deep-Link Builder:**
    ```js
    export const generateMealPlanIcs = (mealPlan, recipes, weekStartDateStr) => { /* RFC-5545 VCALENDAR string */ };
    export const buildStoreSearchUrl = (storeName, baseUrl, query) => { /* Store-specific search URI */ };
    ```
- **Verification & Acceptance Criteria:**
  - `generateMealPlanIcs` produces valid `BEGIN:VCALENDAR` / `BEGIN:VEVENT` / `END:VCALENDAR` output with escaped newlines (`\\n`) and deterministic `UID`s in `node --test`.
  - Store deep-links resolve to valid search URLs (`instacart.com/store/s?k=...`, `walmart.com/search?q=...`, etc.).
- **Rollout & Fallback Strategy:**
  - Pure client-side file generation (`Blob` + `URL.createObjectURL`) and deep-link construction with zero external third-party API keys required.

---

## 3. Recommended Phased Implementation

- **Sprint 1 (Immediate Differentiators — Zero Schema Migration Required):**
  1. **F-01:** Canonical Pantry Match Scorer + 1-Click "Smart Auto-Fill Week" in `MealPlanner.tsx` & `Recipes.tsx`.
  2. **F-02:** Visual AI Remix Diff Inspector + Live Serving Scaler (`0.5x–4x`) + Vision Scan Staging Modal & Planner Undo Stack.
  3. **F-03:** Predictive Pantry Expiry Radar, Category Shelf-Life Heuristics & Daily Macro/Dietary Compliance Bar.
  4. **F-04:** Hands-Free Voice-Controlled Cooking Mode + Auto-Extracted Multi-Step Countdown Timers.
- **Sprint 2 (Flagship Expansions — Multi-Modal & Ecosystem):**
  5. **F-05:** Multi-Modal Recipe Ingestion (`POST /api/ai/scan-recipe-image` Cookbook/Card Vision OCR, Zero-Credit Bulk Text Parser & `/recipes/:id/edit` Full Recipe Editor).
  6. **F-06:** Ecosystem Interoperability Hub (RFC-5545 `.ics` Calendar Export, Direct Store Search Deep-Links, Native Web Share & Cookbook `.json`/`.md` Backup/Restore).
