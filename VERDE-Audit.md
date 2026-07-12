# VERDE — Decision Support System Deep Audit (v2)

### Rewritten with the standard import template (`Vellum_Upload_Puroy_Salon.xlsx`) as the primary data source

_Operations Upload, Expenses Upload, Inventory Upload — not the client's fully-computed Excel workbook_

---

## 0. Ground Truth: What the Template Actually Gives You

Everything below is reassessed against these three sheets, exactly as they'll arrive from any business using the standard template — not the richer, already-computed Puroy workbook from the first audit.

| Sheet                 | Columns                                                                                                                | Grain                           | Confirmed from the 2-year sample                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operations Upload** | Date, Service Name*, Quantity*, Revenue (PHP)\*, Category, Unit Price (PHP), Time of Day (AM/PM), Notes, Business Name | one row per service transaction | 5,208 rows / 730 distinct dates (~7/day, range 3–12), unit price × qty reconciles to revenue with zero mismatches, **Time of Day empty in 100% of rows**, some visits logged as combo labels (`"Rebond, Cello, Haircut"`) rather than one row per service |
| **Expenses Upload**   | Date, Category, Amount (PHP)\*, Notes, Business Name                                                                   | one row per expense entry       | 3,653 rows, real daily entries across Electricity/Water/Salary/Commission/Supplies — genuinely complete and reliable                                                                                                                                      |
| **Inventory Upload**  | Product Name, Unit, Month, Opening/Purchased/Used/Closing Stock*, Status*, Notes, Business Name                        | one row per product per month   | 168 rows (7 products × 24 months). **No Reorder Point, Unit Cost, or Supplier column exists.** Status is a manually-chosen 6-value dropdown, not computed.                                                                                                |

\*= required field. Two structural facts drive nearly every reassessment below:

1. **The template is built for arbitrary-length daily transactional history (the sample alone is 2 full years), but the current app hardcodes a fixed 5-month window** (`MONTH_LABELS = ['Jan','Feb','Mar','Apr','May']`, `actuals[5]`/`forecasts[3]` arrays sized to that). The app was built against a snapshot of the client's data, not against what the template it ships alongside is actually designed to accept. This mismatch is more important than any single formula bug — it means the app can't correctly ingest its own template's realistic output.
2. **Inventory forecasting cannot function on this template as designed**, because Reorder Point and Unit Cost — the two fields every inventory formula in the app depends on — are never collected. This downgrades several Inventory-module fixes from "code changes" to "blocked until the template changes."

---

## 1. Dashboard Data Audit (page by page, reassessed)

### 1.1 Overview

| Element                                                              | Original assessment                                                                                    | Reassessed against the template                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revenue Forecast chart, Revenue by Service pie, Daily Log filter bug | Same findings as before (fake forecast overlay, bookings-not-revenue pie, filter computed-but-unused). | Unchanged — these are code bugs independent of the data source.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Chart labels "Jan–May"                                               | Assumed a fixed 5-month pilot dataset.                                                                 | **Now a confirmed structural defect.** The template supports (and the sample demonstrates) 24 months of daily data. A business uploading a full year via this template will have its Overview chart still show 5 hardcoded month labels — either truncating real history or mislabeling it. The chart needs to render **whatever date range is actually in the data**, grouped to whatever granularity fits (daily for <60 days, weekly for <12 months, monthly beyond that), not five fixed labels. |
| Daily Operations Log                                                 | table of `Date, Day, Sessions, Revenue, Expenses, Net, Top Service`                                    | "Sessions" is really "row count for that date." Given the confirmed combo-labeling in Operations Upload (§0), a visit logged as one combo row and a visit logged as three separate-service rows count as 1 and 3 "sessions" respectively for the _same amount of actual chair-time_. This inflates/deflates Sessions inconsistently across businesses depending on how staff happen to enter combos — a real comparability problem once you have multiple tenants.                                   |

**New Overview requirement:** a **date-range-aware rendering layer** — compute "how many months/weeks of history exist" from the actual `MIN(date)`/`MAX(date)` in Operations Upload, and size every chart, table, and forecast window off that, not off a constant.

### 1.2 Service Demand

Unchanged conceptually, but two template-driven corrections:

- **Category rollups are template-supported and should be added now, not later.** `Category` is optional in Operations Upload but was filled for 100% of rows in the sample (Chemical Treatment, Cut & Style, Grooming, Nail Care, Spa). Category-level demand (not just per-service) is a cheap, high-value addition — group by `Category` the same way you group by `Service Name`.
- **Combo-labeled services will distort the forecast table.** `"Rebond, Cello, Haircut"` will appear as its own row in the Service Demand table, competing for "top service" ranking against `"Haircut"` alone, even though every combo transaction also represents (uncounted) haircut demand. Until Operations Upload either disallows combo labels or gets a `Visit ID` (§0, carried over from the addendum), any service-level ranking should be read with this caveat, and the forecast table should visually flag combo-labeled rows so they're not mistaken for a single discrete service offering.

### 1.3 Inventory — reassessed as **not currently functional against template data**

This is the page most changed by the template review.

| Element                         | What the code computes                        | What the template can actually supply                                                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical SKUs count             | `stock <= reorderPoint`                       | **Impossible** — no `reorderPoint` column exists anywhere in Inventory Upload. This KPI cannot be computed from a standard template upload; it currently only works because the demo data was hand-built with a `reorderPoint` field that isn't part of the real import path. |
| Suggested Order value           | `reorderPoint × 120` (flat placeholder price) | **Impossible either way** — no reorder point _and_ no unit cost. Even the flawed placeholder formula from the first audit has no valid input to run against once you're on the real template.                                                                                 |
| Days of Cover                   | `stock / reorderPoint × 7`                    | Same problem — no reorder point.                                                                                                                                                                                                                                              |
| Status badge (Critical/Healthy) | derived from stock vs. RP                     | The template's own `Status` column (STOCKOUT/CRITICAL/LOW/OK/OVERSTOCK/EXCESS) is never read by the app at all — the one inventory signal a business actually provides is discarded, while the app tries to compute its own status from a field that doesn't exist.           |

**This changes the priority order from the first audit entirely.** Previously, "fix the days-of-cover formula" and "use unit cost instead of a flat 120" were formula bugs. Against the real template, they're not fixable in code — they're blocked on a **template schema change** (add Reorder Point, required; Unit Cost, strongly recommended; Supplier, optional). Until that ships, the honest move is either: (a) disable the Inventory dashboard's dollar/urgency metrics for template-only businesses and show only what the data supports (stock trend, self-reported Status), or (b) compute a **provisional reorder point** from consumption history itself (e.g., flag anything trending toward zero within N weeks based on `Used` velocity) so the module still works without asking businesses for a number many won't know off the top of their head.

I'd recommend (b) as the real fix, with (a) as the honest fallback until it ships — see §3.6 and §7 below for the actual formula.

### 1.4 Financials — reassessed as the **strongest-supported module** given the template

Unlike Inventory, Financials is now on solid ground: Expenses Upload's 3,653-row sample is genuinely complete, categorized, and reconciles cleanly. All the fixes from the first audit (real category breakdown instead of fixed 30/8/5%, real WMA-based revenue/expense forecasting instead of `×1.08`/`×1.02`, real net-margin trend instead of hardcoded progress-bar percentages) are **fully achievable with zero template changes** — the only blocker was ever the app code, not the data. This should now be the single highest-confidence item on the roadmap.

One template-level gap worth raising with the client: **no Rent/Lease category appears in the sample**, and `Category` in Expenses Upload is free text, not a controlled list — so "Rent," "Rental," and "Lease" could all appear as different categories across different businesses, breaking any category rollup or cross-business benchmark. Recommend constraining `Category` to a dropdown (the same pattern the Inventory sheet already uses for `Status`) with a standard list: Rent, Electricity, Water, Salary, Commission, Supplies, Marketing, Equipment, Taxes/Licenses, Other.

### 1.5 Staffing — reassessed with corrected Time-of-Day expectations

- The heatmap and fixed day-of-week multipliers are still fabricated (unchanged finding from the first audit) — but the **replacement isn't an hourly heatmap**, it's an **AM/PM split at most**, because that's the template's actual granularity (`Time of Day (AM/PM)`), and even that column was **100% empty** in the real 2-year sample. A staffing feature built assuming hourly precision would be building against data that structurally cannot exist from this template, and possibly against a field that in practice never gets filled in at all.
- **Weekday-level staffing, by contrast, needs no new template fields at all** — `Date` is required and always present, so real weekday patterns (as opposed to the fixed Mon 45%/Sat 115% constants) are fully computable today, from any business's upload, with zero schema changes. This should be the priority fix here, with AM/PM treated as an enhancement that activates only when fill-rate justifies it (see §2 and §6).
- The "sessions per staff" ambiguity (§0) directly undermines the Recommended Staff column regardless of formula quality — two visits requiring identical chair-time can register as 1 session or 3 depending on how combos were logged.

---

## 2. AI Context Audit (reassessed)

Your original example — _"what are the peak hours during Monday, top 2 services that day"_ — needs to be split into what's honestly answerable today versus what depends on data that, per the real template, may simply never arrive:

| Sub-question                              | Achievable from template?                                                                                | What's needed                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "What day is busiest?" / weekday patterns | **Yes, always** — `Date` is required and always populated.                                               | A `weekdayPatterns` aggregate (§0), no template change needed.                                            |
| "Top 2 services on Monday?"               | **Yes, always** — `Service Name`/`Category` + `Date` are both present.                                   | A `serviceByWeekday` aggregate. Caveat: combo-labeled rows will show up as their own "service."           |
| "What are the peak _hours_ on Monday?"    | **Conditionally** — only if `Time of Day` is filled in, and only to AM/PM resolution, never true hourly. | Must check fill-rate before claiming this; in the real sample, this would currently be **0% answerable**. |
| "What's driving my expenses up?"          | **Yes, confidently** — Expenses Upload is complete and categorized.                                      | `expenseByCategory`, straightforward.                                                                     |
| "What should I reorder?"                  | **No, currently unanswerable** — no Reorder Point or Unit Cost exists in the data at all.                | Either a template change, or a consumption-velocity-based provisional reorder signal (§1.3, §3.6).        |

**The core fix to the AI context builder isn't just "add more aggregates," it's "make every aggregate self-aware of its own data sufficiency."** Concretely, the context payload should carry a `dataAvailability` block:

```
dataAvailability: {
  timeOfDayFillRate: 0.0,      // computed from real rows, not assumed
  inventoryHasReorderPoints: false,
  inventoryHasUnitCost: false,
  dateRangeMonths: 24,
  expenseCategoriesTracked: ["Electricity","Water","Salary","Commission","Supplies"]
}
```

This lets the system prompt instruct the AI: _"If `timeOfDayFillRate` is below some threshold, say hourly/AM-PM breakdowns aren't available for this business yet, rather than guessing or refusing outright — and be specific about what's missing, not just that something's missing."_ That's the difference between the AI's current flat "the dashboard doesn't include Monday-specific hourly data" and something like _"I can tell you Monday is your slowest day and your top services then are X and Y — I don't have time-of-day data for this business yet to break it down further."_ Same underlying limitation, dramatically more useful answer.

---

## 3. Formula Audit (reassessed — now split by "fixable in code" vs. "blocked by template")

### Fixable purely in code (unchanged from the first audit, template doesn't affect these)

- Financial forecast `×1.08`/`×1.02` → replace with WMA (or trend regression) — **now higher-confidence**, since Expenses Upload proves the inputs are real and reliable.
- Fixed KPI change badges (`"+8.0%"` hardcoded strings) → compute real deltas.
- Fixed 30/8/5% expense breakdown → real category totals from Expenses Upload — **fully supported today.**
- Fixed day-of-week staffing multipliers → real weekday aggregation from `Date` — **fully supported today.**
- Synthetic stock-trend chart (`totalStock/6, /7, /8...`) → real historical `Closing Stock` from Inventory Upload's monthly rows — **this one is actually fine on the template**, since Closing Stock per month is a required field. Remove the fabricated formula and just plot the real series.

### Newly blocked by the template (need a schema change, not a code change)

- **Days of Cover** (`stock / RP × 7`) — no RP exists. See §3.6 below for a working replacement that doesn't need one.
- **Suggested Order value** (`RP × 120`) — no RP, no unit cost. Same fix applies.
- **Critical-status detection** (`stock <= RP`) — no RP. Replace with a consumption-trend-based signal (below).

### 3.6 — Corrected Inventory formulas that work without Reorder Point or Unit Cost

Since RP/unit cost may never arrive for many businesses, the inventory logic should be rebuilt to run on what the template **guarantees**: `Opening Stock, Purchased, Used, Closing Stock` per product per month.

- **Consumption rate** = `Used / days in that month` — always computable.
- **Provisional days-of-cover** = `Closing Stock / consumption rate` — a real, defensible number, computable for every business regardless of whether they ever fill in a reorder point.
- **Provisional critical flag** = days-of-cover below some threshold (e.g., 14 days) — replaces the RP-dependent binary status entirely.
- **If/when Reorder Point is added to the template later**, treat it as a _refinement_ on top of this (e.g., "reorder by [date], with [N] days of buffer above your stated reorder point") rather than the sole mechanism — this way the module degrades gracefully for businesses that never provide RP, instead of being entirely non-functional for them, which is the current state.
- **Suggested order value** without unit cost: report **quantity to reorder** (a real, always-computable number: enough to return to, say, 60 days of cover) rather than a peso amount. Only show a ₱ figure once Unit Cost is actually present in the data — showing a fabricated placeholder price (the current `× 120`) is worse than not showing a dollar figure at all.

### Everything else from the original formula audit

MAPE, margin, net income = revenue − expenses, and the WMA(n=3) service forecast are unaffected by this template review — those findings stand as written in the first audit.

---

## 4. Forecasting Audit (materially revised)

The first audit's forecasting recommendations were calibrated to "5 months of data" because that's what the current app's hardcoded pipeline exposes. **The template review shows this assumption was wrong for what the system will actually receive in production**: the sample alone has 24 months of daily transactions. This changes the recommended method progression substantially.

| Original recommendation (assumed 5 monthly points)        | Revised recommendation (real: up to 24 months of daily data)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Don't attempt seasonality — not enough data"             | **Seasonality is now realistic and worth building**, at least weekday seasonality (7-day cycle, always available) and plausibly monthly/holiday seasonality with 24 months of history.                                                                                                                                                                                                                                                                                                          |
| WMA(n=3) as sole method                                   | WMA is still fine as a simple baseline, but with 24 months available, **Holt-Winters exponential smoothing (multiplicative, weekly + monthly seasonality)** becomes a legitimate option, not overfitting — this is exactly the case where the original Section 7 analysis's "Option B" (statsmodels/Prophet-class methods) starts to make sense, not because the model is more prestigious, but because there's now enough data to actually estimate a seasonal signal instead of guessing one. |
| Confidence bands as ± MAPE heuristic                      | Same recommendation stands, but now computable at weekly or monthly resolution instead of only 5 fixed points, giving a much more stable variance estimate.                                                                                                                                                                                                                                                                                                                                     |
| No holiday/event calendar — too little data to justify it | With 24 months, you can actually check whether known Philippine dates (Valentine's, Mother's Day, Christmas season) show up as real spikes in _this_ business's own history, rather than assuming they do — turning a guess into an evidence-backed feature.                                                                                                                                                                                                                                    |

**The forecasting bottleneck is no longer data volume — it's the app's hardcoded 5-column pipeline.** Before any of the above is worth building, the underlying data layer needs to stop assuming a fixed `Jan..May` shape and instead work off whatever `MIN(date)`–`MAX(date)` range actually exists per business. That's a prerequisite, not a parallel task.

---

## 5. Data Model / Query Audit (rebuilt around the template schema)

| Function                                                         | Template columns it should read                                       | Template gap affecting it                                                                              | Fix                                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `getKPIsOverview()`                                              | Operations: Date, Revenue                                             | None                                                                                                   | Compute real MoM delta once date range isn't hardcoded                                                     |
| `getRevenueSeries()` / `getFinancialSummary()`                   | Operations: Date, Revenue; Expenses: Date, Category, Amount           | None — but currently only reads a 5-month slice                                                        | Rebuild to group by actual date range at whatever granularity fits (§4)                                    |
| `getServicesForecastTable()`                                     | Operations: Date, Service Name, Category, Quantity, Revenue           | Combo-labeled rows distort per-service grouping                                                        | Group by `Category` as a first-class dimension alongside `Service Name`; flag combo labels                 |
| `getDailyLog()`                                                  | Operations: Date (grouped), Revenue; Expenses: Date, Category, Amount | "Sessions" = row count, ambiguous without a visit identifier                                           | Add `Visit ID` to template (§0); until then, document Sessions as "transactions," not "customers"          |
| `getInventoryItems()` / `getRestockList()`                       | Inventory: Product Name, Opening/Purchased/Used/Closing Stock, Status | **No Reorder Point, Unit Cost, or Supplier — these functions cannot return what the UI expects today** | Rebuild around consumption-rate logic (§3.6); merge the two near-duplicate functions while at it           |
| _(new)_ `getWeekdayPatterns()`                                   | Operations: Date, Revenue, Quantity                                   | None                                                                                                   | New — fully supported today                                                                                |
| _(new)_ `getExpenseCategoryBreakdown()`                          | Expenses: Date, Category, Amount                                      | Free-text category risks drift across businesses                                                       | New — recommend constraining `Category` to a dropdown first                                                |
| _(new)_ `getInventoryConsumptionSignal()`                        | Inventory: Used, Closing Stock, Month                                 | None                                                                                                   | New — replaces the RP-dependent logic entirely (§3.6)                                                      |
| _(new, conditional)_ `getTimeOfDayPatterns()`                    | Operations: Time of Day                                               | **Must check fill-rate before use** — confirmed 0% filled in the real sample                           | New, but gate behind a minimum fill-rate threshold                                                         |
| _(blocked until template changes)_ `getReorderRecommendations()` | Would need Inventory: Reorder Point, Unit Cost, Supplier              | **These columns don't exist**                                                                          | Cannot be built until the template adds them, or until §3.6's provisional logic replaces the need for them |

---

## 6. AI Context Code Audit (reassessed)

The structural critique from the first audit stands (hardcoded `MONTH_LABELS`, synthetic `getStaffingContext()`, no data-freshness signal). Two template-driven additions:

- **The context builder needs a `dataAvailability` block** (shown in §2) so the AI can distinguish "not tracked for this business" from "tracked but this business hasn't filled it in" from "fully available." Right now the system prompt's instruction to "say so plainly rather than guessing" has no structured signal to work from — it's relying on the model to infer absence from missing keys, which is fragile.
- **Inventory-related AI answers need an explicit capability flag.** Since Reorder Point/Unit Cost may genuinely never exist for a given business, the AI should be told (via context, not just prompt wording) whether reorder recommendations are running on real thresholds or the consumption-velocity fallback from §3.6 — so it can honestly caveat "based on your usage trend" vs. "based on your stated reorder point," rather than presenting both with identical confidence.

---

## 7. Decision Support Audit (reassessed)

Every recommendation from the first audit is still directionally right; the template review changes _what data each one can run on today_:

| Recommendation                                          | Runs today on template data?                          | Note                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Margin risk warning                                     | Yes                                                   | Fully supported via Expenses Upload                                                                   |
| Staffing adjustment by weekday                          | Yes                                                   | Fully supported via Operations Upload's `Date`                                                        |
| Reorder now (ranked by urgency)                         | **Only via the consumption-velocity fallback (§3.6)** | Not via reorder point — none exists                                                                   |
| Overstock flag                                          | Yes, partially                                        | `Used` trending down while `Closing Stock` stays flat/rises is fully computable from required columns |
| Revenue concentration / ABC analysis                    | Yes                                                   | `Service Name`/`Category` × `Revenue`, fully supported                                                |
| Promotion opportunity (fill slow days)                  | Yes                                                   | Weekday patterns fully supported; AM/PM version gated on fill-rate                                    |
| Forecast self-audit (accuracy over time)                | Yes, once `forecast_snapshots` exists                 | Independent of the template, a backend addition                                                       |
| Pricing/underpricing signal (revenue-per-booking trend) | Yes, with a caveat                                    | Combo-labeled transactions will distort per-service pricing signals — same caveat as §1.2             |

---

## 8. Missing Analytics (reassessed)

Carrying forward from the first audit, re-scoped by what the template actually supports:

- **Weekday × service/category demand** — fully supported now, no schema change, should move to the front of the queue.
- **AM/PM demand** — supported _if_ filled in; build with a fill-rate gate, don't assume it'll be there.
- **True hourly demand** — **not supported by this template at any fill rate.** Drop this from the roadmap entirely unless the template itself is redesigned to capture timestamps (a bigger ask of salon staff, worth weighing against how much it would actually get used).
- **ABC/Pareto revenue contribution** — fully supported (Service Name/Category × Revenue).
- **Consumption-based inventory turnover** — fully supported using required Inventory Upload fields alone (§3.6) — genuinely one of the strongest "missing analytics" opportunities precisely because it needs no schema change.
- **Expense category trend + anomaly detection** — fully supported.
- **MoM/WoW/QoQ/YoY comparisons** — fully supported once the app stops hardcoding 5 months (§4).
- **Customer retention/LTV, staff productivity, no-show/cancellation, booking lead time** — **still entirely blocked**, unchanged from the first audit; none of these fields exist anywhere in the template. These remain schema-level asks to raise with the client/business, not code tasks.
- **Reorder recommendations tied to a real ₱ value** — blocked until Unit Cost is added to the template (§3.6 gives a workaround that avoids needing this for the _quantity_ recommendation, but the _dollar_ framing genuinely needs Unit Cost).

---

## 9. Missing AI Capabilities — Reassessed Question Walkthrough

| Question                                                   | Answerable from the template today?                                                                                                                      | What's actually needed                                                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Which day is my slowest, and what should I do about it?"  | **Yes**                                                                                                                                                  | `weekdayPatterns` + a slow-day promotion rule (§7) — no schema change                                                                                                 |
| "Peak hours on Monday, top 2 services that day?"           | **Partially** — weekday + top services yes; "peak _hours_" no, unless this business happens to fill in Time of Day                                       | Split the answer: give what's real, name what's missing specifically                                                                                                  |
| "What should I reorder this week?"                         | **Only approximately**, via consumption velocity                                                                                                         | Real answer needs Reorder Point/Unit Cost; today's honest answer is "trending toward low stock in ~N days," not a precise reorder quantity tied to a stated threshold |
| "Why did my expenses jump last month?"                     | **Yes**                                                                                                                                                  | Category breakdown, fully supported                                                                                                                                   |
| "How does this month compare to the same month last year?" | **Yes, if the business has ≥13 months of history** (this sample has 24)                                                                                  | YoY comparison — but the app must stop hardcoding a 5-month window first                                                                                              |
| "Do I have a rent expense?"                                | **Depends on the business** — the sample shows none                                                                                                      | Worth the AI checking category coverage before assuming a category exists, rather than answering as if it definitely tracks something it may not                      |
| "Which service is most profitable, not just most booked?"  | **Partially** — revenue-per-booking, yes; true profitability (service-level cost) no, since costs aren't attributed per service anywhere in the template | Would need either a per-service cost allocation rule or explicit product-cost tagging — worth a v2 template conversation, not a v1 fix                                |

---

## 10. Overall Architecture Review (reassessed)

**What the template review confirms is genuinely good:**

- The import pipeline (column-mapping UI, validation, normalized one-row-per-transaction design) is well-matched to what non-technical salon staff can realistically fill in — the "why this structure" notes in the template's own Instructions sheet are the right instincts (no merged cells, no derived columns, predictable validation).
- Financials is now clearly the most production-ready module once the code-level fixes from §3 ship — the data underneath it is solid.

**What the template review newly exposes as risk, beyond what the first audit found:**

- **The app's data-consumption layer (`lib/data.ts` and every page built on top of it) was built against a 5-month snapshot, not against the general shape the import template is designed to produce.** This is the most important finding across both reviews — it means the import pipeline and the display/forecast pipeline were built to two different implicit schemas, and they will visibly break (mislabeled/truncated charts) the moment any real business uploads more than 5 months of data through the very template you're shipping them.
- **Inventory is not a "needs polish" module, it's a "cannot run on real input" module**, until either the template changes or the consumption-velocity fallback (§3.6) replaces the reorder-point-dependent logic. This should be explicit in any thesis defense or client conversation — better to say "Inventory currently degrades to trend-based estimates when reorder points aren't provided" than to demo a critical/suggested-order figure that silently can't be produced from real uploads.
- **Template field consistency across tenants is an open risk** for your stated commercialization goal — free-text `Category` in Expenses (and combo-style free text in Operations' `Service Name`) will drift business-to-business in ways that break any cross-tenant rollup or benchmark down the line. Worth constraining now, while there's only one real dataset to migrate, rather than after several businesses have inconsistent history.

---

## Updated Priority Roadmap

Reordered from the first audit's roadmap, now weighted by "what does the real template actually make possible, and in what order":

1. **Stop hardcoding the 5-month window.** Every chart, table, and forecast should derive its date range from `MIN(date)`/`MAX(date)` in the actual data. This unblocks correct rendering for any real upload and is a prerequisite for almost everything else here.
2. **Ship the Financials fixes** (real category breakdown, real WMA-based forecast, real margin trend) — highest confidence, zero template changes needed, data already proven solid.
3. **Add weekday-level aggregation** (`weekdayPatterns`, `serviceByWeekday`) — fully supported today, directly unblocks your original example question at the weekday level.
4. **Rebuild Inventory around consumption velocity** (§3.6) instead of the reorder-point-dependent logic that can never be populated from the standard template — this is now a correctness fix, not a nice-to-have, since the current logic is silently unusable on real data.
5. **Add the `dataAvailability` block to the AI context** (§2/§6) so the AI can give honest, specific, partial answers instead of flat refusals or guesses.
6. **Constrain free-text fields that will drift across tenants**: `Category` in Expenses Upload (dropdown, like `Status` already is in Inventory Upload), and reconsider how combo services are entered in Operations Upload (either disallow, or add `Visit ID`).
7. **Raise the template schema gaps with the client explicitly**: Reorder Point + Unit Cost + Supplier for Inventory, and (lower priority) whether Time of Day is worth making required given it was 0% filled in the real sample — these are business conversations, not just engineering tasks, and they determine whether several planned features are worth building at all.
8. **Then, and only then**, revisit forecasting sophistication (§4) — Holt-Winters/seasonal decomposition is now legitimately supportable given 24 months of real daily data, but only once the pipeline can actually consume more than 5 fixed months.
