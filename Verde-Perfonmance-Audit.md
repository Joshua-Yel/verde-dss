# VERDE — Performance Audit

### Based on live route timings from dev logs

---

## 1. What the logs actually show

```
GET /api/aria/context      18.6s   (application-code: 18.1s)   ← worst offender by far
GET /service-demand         7.4s   (application-code: 5.5s)
GET /inventory               5.9s   (application-code: 5.0s)
GET /service-demand          4.7s   (application-code: 4.4s)   ← repeat visit, barely faster
GET /financials              4.2s   (application-code: 3.6s)
POST /api/aria               2.5s   (application-code: 0.9s)   ← this one's fine, LLM latency dominates
GET /?span=all                1.3s   (application-code: 1.0s)   ← acceptable
GET /shields-sw.js            404 ×3, ~0.3-1.1s each             ← not your bug, see §5
```

Two things jump out immediately:

1. **`application-code` time — not network, not Next.js compilation — is where nearly all the latency lives.** `next.js:` and `proxy.ts:` overhead is consistently small (tens to a few hundred ms). This is a backend/data-layer problem, not a framework or infrastructure problem.
2. **Repeat visits barely improve.** `/service-demand` went from 7.4s → 4.7s on a second hit, when a cached or properly-optimized page should drop to well under a second on repeat. That's a strong signal that whatever's slow is being **recomputed from scratch on every single request**, with no caching layer actually working — despite `export const revalidate = 30` sitting at the top of the Overview page.

---

## 2. Root cause #1: `revalidate = 30` isn't actually caching what you think it's caching

`export const revalidate = 30` on a Server Component page tells Next.js to cache the **rendered page output**, not the underlying `fetch`/Supabase calls inside it, and it **does not apply to Route Handlers at all** (`/api/aria/context/route.ts` has no revalidate export, and even if it did, Route Handlers need `export const dynamic` / fetch-level caching configured separately). That means:

- `/api/aria/context` runs its full `Promise.all([...7 queries...])` — and whatever computation sits on top of each of those — on **every single call**, with zero caching. 18 seconds of `application-code` time for what should be simple aggregation over ~10,000 rows total (5,208 Operations + 3,653 Expenses + 168 Inventory) is disproportionate enough that this is almost certainly the actual cause, not just "no cache."
- `/service-demand`, `/inventory`, `/financials` each independently re-run their own Supabase fetch + WMA forecast computation on every navigation, and a `revalidate = 30` at the top of a page doesn't help much if the underlying query itself is the slow part — it just means you re-pay that cost every 30 seconds instead of every request, which explains why repeat visits are _faster but still slow_ (4.7s vs 7.4s) rather than _fast_.

## 3. Root cause #2: computation is happening in JavaScript over full raw tables instead of in SQL

Based on the code shared in earlier review, `getServicesForecastTable()`, `getFinancialSummary()`, `getKPIsOverview()`, etc. appear to be pulling row-level data out of Supabase and then doing grouping/aggregation/forecasting in Node. At 5,208+3,653+168 rows this shouldn't take multiple seconds even done inefficiently — which points to one or more of:

- **`select *` fetching every column** instead of only what's needed, multiplied across thousands of rows.
- **No `GROUP BY`/aggregate pushdown to Postgres** — the DB is handing back raw rows and the WMA/forecast/weekday logic is looping over them in JavaScript on every request, instead of Postgres doing the summing.
- **Missing indexes** on whatever columns are being filtered/sorted on (`date`, `business_id` at minimum) — without them, even a few thousand rows can force sequential scans, and this gets worse, not better, as more businesses/months are added (this compounds directly with the "hardcoded 5-month window" issue from the earlier audit — once businesses upload a full year+, this problem gets materially worse, not just proportionally).
- **Forecast computation (WMA, MAPE) re-run from scratch every request**, when it should be computed once and cached/stored (this is exactly what the `forecast_snapshots` table in your original architecture doc was for — it's designed but apparently not wired in yet).

## 4. Root cause #3: no Suspense/streaming outside Overview — so the whole page blocks

Overview already does this right: `Suspense` boundaries around `KpiSection`, `RevenueChartSection`, `RevenueByServiceSection`, and `DailyLogStreamSection`, each with its own skeleton (`KpiRowSkeleton`, `ChartCardSkeleton`, `TableCardSkeleton`). That's why Overview's logged time (1.3s) looks so much better than the others — it's not necessarily _faster underneath_, it's that the page can start painting immediately instead of the entire route blocking on one big `await`.

Service Demand, Inventory, and Financials are each a single `async function Page()` that awaits everything before returning any JSX. In the App Router, that means **the whole page — including the header, KPI cards, and any content that has no data dependency — is held back until the slowest query finishes.** From the user's perspective this looks exactly like what you're describing: click a tab, nothing happens, then the whole page appears at once. This is a real, fixable UX problem independent of fixing the underlying query speed.

## 5. Noise that isn't your bug

- `GET /shields-sw.js 404` — this is a browser privacy extension (Brave/Ghostery-style "Shields") requesting a service worker file that doesn't exist in your app. It's harmless, not something your server is doing wrong, and not worth chasing — you can suppress the console noise with a trivial empty `public/shields-sw.js` if it's distracting, but it has no effect on real users without that extension.
- `proxy.ts` overhead (200–800ms fairly consistently) looks like fixed dev-environment overhead rather than something that scales with your data — worth a quick sanity check in a production build, but it's not the multi-second problem.

---

## 6. Priority-ordered fix list (see the companion Copilot prompt for implementation detail)

1. **Move aggregation into SQL** (Postgres `GROUP BY`/aggregate functions or views), instead of pulling raw rows into JS — this alone likely accounts for most of the multi-second waits.
2. **Add indexes** on `date` and `business_id` (or tenant scoping column) on every business-data table.
3. **Precompute and cache forecasts** — write to `forecast_snapshots` on import/on a schedule, read from there on page load, instead of recomputing WMA on every request.
4. **Add real caching to `/api/aria/context`** — this is your single worst offender (18.6s) and currently has no caching at all.
5. **Add Suspense + skeleton streaming** to Service Demand, Inventory, Financials, and Staffing, matching the pattern Overview already uses — so a click always paints something immediately instead of freezing the tab.
6. **Reduce ARIA context payload size** — sending full inventory/operations arrays on every chat turn compounds both the context-building cost and the Gemini request itself.

The companion file (`VERDE_Copilot_Optimization_Prompt.md`) turns this into an execution checklist.
