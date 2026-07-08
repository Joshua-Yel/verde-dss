# AI-Assisted Demand Forecasting & Decision Support

# System

### Project Assessment and Development Plan

_Prepared by Josh · INNEWGEN | For review by the thesis group | July 2, 2026_

## 1. Project Background & Objectives

This is the system for the group's Bachelor of Arts in Business Management (Operations Management) thesis: an
AI-Assisted Demand Forecasting and Decision Support System (DSS), built around the partnered salon's actual
operations data. The goal is a system that does double duty, it needs to hold up as a thesis defense project, and it
needs to actually be usable by the salon owner day to day.
Reviewing the existing prototype you shared with me, I can see the feature foundation is already layouted: a
semi-working dashboard covering Operations Overview, Service Demand Forecast, Inventory Forecast & Reorder
Planning, Financial Projection, and Staffing & Peak Period Forecast, built on the salon's real daily logs (Jan–May 2025)
and a six-month service/expense history (Nov 2024–Apr 2025). It already uses a Weighted Moving Average for
forecasting and frames itself around the Input-Process-Output model from the thesis's theoretical framework. That's a
good base, my job is to take it from a static, hardcoded prototype to a dynamic, production-grade system with the
three new capabilities you asked for.
The three additions that aren't in the current prototype:

- Excel import — upload raw operational data and have the system process it automatically.
- Report export — PDF and Excel output for forecasts, reports, and charts.
- An AI companion — a chat-based assistant that explains forecasts, answers questions, interprets reports, and
  gives recommendations.

## 2. Timeline & Delivery Plan

We have two weeks. Target completion and deployment is July 18. I want to be upfront about what that timeline
realistically allows, because it directly shapes the platform decision in Section 9.
**Phase Days Focus**
Setup & Data Layer 1–2 Repo, hosting, database schema, auth, import of the existing salon
dataset

**Phase Days Focus**
Core Forecasting Modules 3–6 Rebuild Demand, Inventory, Financial, Staffing modules as dynamic (not
hardcoded) features
New Features 7–10 Excel import pipeline, PDF/Excel export, AI companion (Gemini
integration)
Polish, Testing, Deployment 11–13 Cross-device testing, bug fixes, seeding demo data, deployment
Buffer / Thesis Prep 14 handover, walkthrough rehearsal, Manual
That buffer day is intentional. Two-week builds with a hard external deadline always run into at least one surprise —
an API quota issue, a chart library quirk, a data formatting edge case.

## 3. Recommended Technology Stack

Assessing this against development speed, scalability, maintainability, cost, ease of deployment, future expansion, and
production readiness. Here's where I've landed, with the reasoning for each layer.

### 3.1 Frontend

**Next.js (React) + TypeScript + Tailwind CSS**
The existing prototype is already a client-rendered dashboard with Chart.js, so the visual language carries over
directly. Next.js gets us server-side rendering for fast loads, a built-in API layer so we don't need a separate backend
service, and — critically for the "installable app" requirement — first-class support for Progressive Web App (PWA)
tooling. TypeScript catches data-shape bugs early, which matters a lot when we're juggling forecasts, inventory
records, and financial rows that all need to line up correctly.

### 3.2 Backend & Database

**Supabase (PostgreSQL + Auth + Storage) via Next.js API routes**
For a two-week build, I don't want to hand-roll authentication, role permissions, and a database from scratch.
Supabase gives us a managed Postgres database, built-in authentication, row-level security (which maps directly onto
our role-based access control needs), and file storage for uploaded Excel files — all with a generous free tier and a
straightforward upgrade path if the salon business grows or we commercialize this later. It also means our forecasting
logic and business rules stay inside our own Next.js API routes rather than being locked into a vendor's proprietary
function format, which keeps us portable if we ever need to migrate.

### 3.3 AI Layer

**Google Gemini API ( a good fit)**
Gemini works well here for two distinct jobs: powering the AI companion's natural-language explanations, and
(optionally) assisting with anomaly detection or narrative summaries on top of the statistical forecasts. I'd keep those
two jobs cleanly separated in the architecture — Gemini explains and recommends, but the numbers themselves

come from a dedicated forecasting layer (see Section 7). That separation matters for a thesis defense: panelists will
want to know the forecasting numbers are reproducible and explainable, not black-box AI output.

### 3.4 Forecasting & Data Processing

- statsmodels-style logic implemented in TypeScript/JavaScript, or a lightweight Python microservice if we need
  more advanced models — see Section 7 for the full build-vs-use analysis.
- SheetJS (xlsx) for reading uploaded Excel files in the browser and on the server.
- ExcelJS for generating exportable Excel reports.
- A PDF generation library (e.g., pdf-lib or a headless-Chromium renderer) for exportable PDF reports.

### 3.5 Deployment & Infrastructure

- Vercel for hosting the Next.js app during development and as the production web deployment — this satisfies
  your request to have something the group can monitor and test throughout the two weeks.
- PWA packaging for the "installable on desktop and mobile" requirement, detailed fully in Section 9.
- GitHub for version control, with Vercel's automatic preview deployments on every push so the group can review
  changes without me sending files back and forth.

### 3.6 Stack Summary

```
Concern How this stack addresses it
Development speed Supabase + Next.js removes the need to build auth, DB, and file storage from scratch
Scalability Postgres scales well past single-salon usage; Vercel and Supabase both scale horizontally
Maintainability TypeScript + a conventional Next.js structure is easy to hand off or for future devs to pick up
Cost Free tiers cover the thesis deployment; paid tiers only kick in at real commercial scale
Ease of deployment Git push → Vercel auto-deploy; no server management required
Future expansion Multi-tenant ready with Postgres row-level security; API-first design supports a future native
app
Production readiness Same stack, same code, from prototype through commercial launch — no rewrite needed
```

## 4. System Architecture Overview

At a high level, the system is a single Next.js application with three logical layers sitting on top of Supabase:

1. Presentation layer — the dashboard, forecast views, import/export screens, and the AI companion chat widget,
   all React components styled with Tailwind.
2. Application layer — Next.js API routes that handle authentication checks, run the forecasting calculations,
   process uploaded Excel files, generate export files, and proxy requests to the Gemini API.
3. Data layer — Supabase Postgres, storing raw operational records, computed forecast snapshots, user accounts
   and roles, and audit logs.

For multi-salon readiness, every table that holds business data (daily logs, services, inventory, expenses) carries a
business_id / tenant_id column, and Supabase row-level security policies scope every query to the logged-in user's
business. This is the single most important architectural decision for the commercialization goal — it's much easier to
build this in from day one than to retrofit it later.

### 4.1 High-Level Data Flow

- Owner/staff logs in → dashboard loads → API layer queries Supabase, scoped to that business.
- New data arrives either through manual entry forms or Excel upload → validated → written to Postgres.
- Forecasting functions run against the stored history → results cached as forecast snapshots (so charts don't
  recompute on every page view) → displayed on dashboards.
- User asks the AI companion a question → API route builds a context payload (relevant forecast + report data) →
  sends it to Gemini → returns a plain-language answer, never raw model access to the database.
- User requests a report → export API pulls the relevant data and forecast results → renders to PDF or Excel →
  returns a download link.

## 5. Database Design Recommendations

Based on the shape of the existing prototype's data (daily operations log, service revenue tracker, monthly expenses,
inventory tracker), here's the core schema I'd build toward. This is deliberately generic rather than salon-specific, per
your commercialization goal.
**Table Purpose**
businesses One row per tenant business (name, industry type, settings, branding)
users Linked to Supabase Auth; includes role and business_id
daily_operations Date, sessions/transactions, revenue, cost line items — the core time series
services Configurable list of services/products offered by the business
service_sales Monthly or daily sales per service, feeding the demand forecast
inventory_items Configurable item list with unit of measure and reorder thresholds
inventory_records Opening/purchased/used/closing stock per period per item
expenses Categorized recurring and one-off costs
forecast_snapshots Cached forecast results with method used and generation timestamp
imports Log of every Excel upload — filename, uploader, row count, validation status
reports Generated report metadata and links to exported files
audit_logs Who did what, when — required for the security section below

Keeping services, inventory_items, and expense categories as configurable rows (rather than hardcoded columns,
which is how the current prototype's data is structured) is what makes the system reusable for a different salon — or a
different business type entirely — without touching the codebase.

## 6. Complete Feature Audit

This is the full breakdown you asked for: every feature, what it does in plain terms, who can access it, every page in
the system, and how the major workflows operate end to end.

### 6.1 User Roles & Permissions

```
Role What they can do
Owner/Admin Full access: manage users, edit all data, configure services/inventory items, view all
reports, manage business settings
Staff/Manager Enter daily operations data, view dashboards and forecasts, generate reports, cannot
manage users or business settings
Viewer (optional) Read-only access to dashboards and reports — useful for an accountant or investor
who needs visibility without edit rights
```

### 6.2 System Pages / Screens

```
Page What it's for
Login / Onboarding Authentication, and first-time business setup (name, services, starting inventory)
Dashboard (Overview) KPI summary, revenue trend, service mix, recent operations log — same role as today's
Overview page
Demand Forecast Per-service forecast charts and a next-period summary table across all services
Inventory Forecast Reorder recommendations, stock trend per item, low-stock and stockout flags
Financial Projection Revenue vs. expenses, net income trend, expense breakdown forecast
Staffing & Peak Periods Day-of-week demand and revenue patterns, recommended staffing plan
Data Entry New — manual entry forms for daily operations, so the system doesn't depend solely
on Excel uploads
Import Data New — upload and review Excel files before they're committed to the database
Reports New — generate, preview, and download PDF/Excel reports
AI Assistant New — chat interface for asking questions about forecasts and getting
recommendations
Settings / Admin Manage users, services, inventory items, business profile, notification preferences
```

```
Page What it's for
About / Methodology Carried over from the prototype — explains the forecasting method and data sources
for defense purposes
```

### 6.3 Core Feature List (Plain-Language)

```
Feature In plain terms
Demand forecasting Looks at past service bookings and predicts how many sessions each service will likely
get next period, so the owner can plan staffing and supplies ahead of time
Inventory forecasting Predicts what stock will run low based on usage patterns and recommends what to
reorder and when
Financial projection Projects next period's revenue, expenses, and profit based on historical trends
Staffing recommendations Shows which days of the week are busiest so the owner can schedule the right number
of staff
Excel import Lets the owner upload their existing spreadsheet records instead of retyping
everything by hand
Report export Turns any dashboard view into a shareable PDF or Excel file — useful for accountants,
investors, or record-keeping
AI companion A chat assistant that reads the current forecast and answers questions like a
knowledgeable business advisor would, in plain language
Role-based access Makes sure staff can log data without being able to see sensitive financials, while the
owner sees everything
Audit logging Keeps a record of who changed what, so data mistakes or disputes can be traced
```

### 6.4 Overall User Flow

4. Owner sets up the business profile, services, and inventory items during onboarding (or imports them from an
   existing spreadsheet).
5. Staff logs daily operations either through the manual entry form or a periodic Excel upload.
6. The system recalculates forecast snapshots whenever new data is committed.
7. Owner checks the dashboard, drills into whichever forecast area needs attention (demand, inventory, financial,
   staffing).
8. Owner asks the AI companion a follow-up question if a chart or number needs explaining.
9. Owner exports a report if they need to share it outside the system or keep it for records.

### 6.5 Demand Forecasting Workflow

This mirrors what the prototype already does, generalized: pull the historical sessions/revenue for each service, apply
the chosen forecasting method (Weighted Moving Average by default — see Section 7), and produce a next-period

estimate per service plus a confidence indicator. The per-service view (like the prototype's chart-demand) lets the
owner select any service and see its trend line and forecast; the summary table gives the same information across all
services at once.

### 6.6 Decision Support System (DSS) Workflow

The DSS layer sits on top of the raw forecasts and turns numbers into recommendations — this is what separates a
forecasting tool from a decision support system, and it's worth being precise about in the thesis framing. Concretely:

- Inventory: forecasted usage vs. current stock → flags LOW / CRITICAL / STOCKOUT / OVERSTOCK status and
  suggests a reorder quantity, exactly as the prototype's reorder table does today, but computed dynamically
  instead of hardcoded.
- Staffing: forecasted demand by day of week → recommended staff count per shift.
- Financial: forecasted revenue/expense trend → flags if net income is projected to dip below a threshold the
  owner can set.
- AI companion: takes any of the above and explains the "why" and the "what should I do" in natural language on
  request.

### 6.7 Excel Import Process

10. Owner/staff uploads a .xlsx or .csv file through the Import Data page.
11. The system parses the file client-side (SheetJS) and shows a preview with detected columns.
12. Because we can't assume every salon's spreadsheet is formatted identically, the import screen includes a simple
    column-mapping step ("which column is Date? Which is Revenue?") the first time a new format is used — this is
    what makes the import genuinely reusable across businesses rather than hardcoded to one file layout.
13. The system validates the data (correct types, no missing required fields, reasonable value ranges) and flags any
    rows with issues before committing.
14. On confirmation, validated rows are written to the database and forecast snapshots are regenerated.
15. The import is logged in the imports table for traceability.

### 6.8 Report Export Process

- PDF export: renders the selected dashboard view (charts, tables, key figures) into a formatted, print-ready PDF
  with the business's branding.
- Excel export: exports the underlying data tables (not just the charts) so the owner or an accountant can do
  further analysis outside the system.
- Both are generated on demand via an API route and offered as a direct download — no separate reporting
  server needed at this scale.

### 6.9 AI Companion (AI Bot)

The companion is a chat widget available from any dashboard page. When the owner asks a question, the system
builds a scoped context payload, the current page's forecast data and relevant recent history — and sends that
alongside the question to Gemini, with a system prompt that keeps its role to explaining and advising rather than
inventing numbers. Example interactions:

- "Why is Rebond bookings expected to drop next month?" → explains the trend behind the forecast.
- "What should I reorder this week?" → summarizes the current inventory DSS recommendations in plain
  language.
- "Is my profit margin healthy?" → interprets the financial projection against the owner's own historical baseline.
  Keeping the AI strictly in an explain-and-recommend role (never a source of the underlying numbers) is both a safety
  measure against hallucinated figures and a stronger academic framing, the forecasting is transparent statistics, and
  the AI is a natural-language interface on top of it.

### 6.10 Notification System

Not in the original prototype, but I'd recommend a lightweight version given the DSS framing — an in-app notification
center (and optionally email) that surfaces things like a critical stock alert, a projected net-income dip, or a completed
Excel import. Given the two-week timeline, I'd scope this to in-app only for now and treat email/SMS as a fast
follow-up rather than a launch blocker.

### 6.11 Dashboard Components

Carried over and generalized from the prototype: KPI cards (top of Overview), line/bar charts per module (Chart.js,
which the prototype already uses and which I'd keep), and summary tables. All of these become dynamic — driven by
whatever data is in the database for that business — instead of the prototype's hardcoded JSON blob.

## 7. Forecasting Algorithm

You asked me to assess whether we should build our own algorithm or use an existing model/library. Here's the
honest breakdown.

### 7.1 Option A — Keep and Extend the Prototype's Weighted Moving Average

- Pros: Already implemented and validated in the prototype; fully transparent and explainable (a real advantage
  for a thesis defense and for a small-business owner who needs to trust the numbers); no external dependency
  or model licensing; trivial to compute inside our own TypeScript API route; performs reasonably well on small,
  monthly-aggregated datasets like a single salon's.
- Cons: Doesn't capture seasonality well beyond what's manually weighted in; accuracy plateaus as a business's
  patterns get more complex; not something you can point to as "we implemented X well-known forecasting
  model," if that matters for the paper's contribution claims.

### 7.2 Option B — Use an Established Forecasting Library (e.g., Prophet, statsmodels' ETS/ARIMA)

- Pros: Handles seasonality and trend changes more robustly; well-documented and peer-reviewed methodology,
  which strengthens the academic grounding; less custom code for us to maintain and debug under time pressure.
- Cons: These libraries are Python-native — Prophet and statsmodels don't have first-class JavaScript equivalents
  — so we'd need a small Python microservice or serverless function alongside our Next.js app, adding a moving
  part to an already tight two-week build; needs a meaningful amount of historical data to outperform simpler
  methods, and the salon dataset we have is currently a matter of months, not years; harder for a non-technical
  panelist or salon owner to have explained to them in an intuitive way.

### 7.4 My Recommendation

Keep the Weighted Moving Average as the default, documented forecasting method. It's already proven in the
prototype, it's fast, it's honest about its own limitations, and it fits the timeline. But generalize it into a small
forecasting module with a clean interface, so that swapping in a more advanced method later (Prophet via a
microservice, or a simple linear regression / exponential smoothing variant) is a matter of adding a new function, not
rearchitecting the system. This gets us production-ready by July 18 without boxing in the "AI-assisted,
machine-learning-supported" framing your thesis title uses, we can genuinely say the architecture supports it, and
note it as a documented area for future work.

## 8. Security & Privacy Recommendations

```
Area Recommendation
Authentication Supabase Auth (email/password, with optional magic link); hashed and salted by the
provider, never handled in our own code
Authorization / RBAC Postgres row-level security policies scoped to business_id and role — enforced at the
database layer, not just in the UI
Password security Delegated to Supabase Auth; enforce a minimum password policy at signup
Data privacy Each business's data is isolated by tenant scoping; no cross-business queries are possible
even by mistake
Audit logs Every create/update/delete on business-critical tables (financials, inventory, users) is
logged with actor, timestamp, and change summary
Backup & recovery Supabase automated daily backups on paid tiers; for the thesis deployment, a manual
weekly export as a low-cost supplement
Data validation Server-side validation on every write, in addition to client-side checks — never trust the
browser alone, especially on Excel imports
API security All API routes require an authenticated session; rate limiting on the Gemini-facing
endpoint to control cost and abuse
Production deployment
security
Environment variables for all secrets/API keys, never committed to the repo; HTTPS
enforced by default on Vercel
Compliance
considerations
Philippine Data Privacy Act (RA 10173) applies since we're handling business and
potentially staff data — reasonable safeguards (encryption in transit, access controls,
data minimization) satisfy the core requirements at this scale
```

## 9. Deployment Strategy

This is the part I want to be most direct about, because I think there's a gap between what was asked for and what's
realistically buildable, production-ready in two weeks, and I'd rather name that now than surprise the group at the
end.

### 9.1 What "installable on desktop and mobile" could mean

**Approach What it involves Fits a 2-week timeline?**
Progressive Web App
(PWA)
The same Next.js app, made installable via the
browser ("Add to Home Screen" / "Install App"),
works offline for cached views, has its own icon
and launches without a browser address bar
Yes — adds roughly a day of
work on top of the web app
we're already building
Native desktop app
(Electron/Tauri)
A separate packaged build wrapping the web
app for Windows/Mac, distributed as a
downloadable installer
Realistically no — packaging,
code-signing, and testing across
OSes is its own multi-day
project on top of everything
else
Native mobile app
(React
Native/Capacitor)
A separate build for iOS/Android, distributed via
app stores or sideloading
Realistically no — app store
review alone can take longer
than our remaining timeline,
and Apple's process specifically
requires a developer account
and review cycle
My recommendation is to build this as a PWA. It genuinely satisfies the core requirement — installable on laptops,
desktops, and phones, launches like a standalone app, doesn't require opening a browser and typing a URL every time
— without the added weeks that native packaging would cost us. It's also the only one of the three options where the
deployed-for-testing version (on Vercel) and the final installable version are literally the same build, which keeps our
two weeks focused on features instead of packaging.
If, after July 18, the group wants a "real" desktop installer for the defense presentation specifically (something that
feels more impressive on stage than "click install in the browser"), Electron or Tauri wrapping the same PWA is a
scoped follow-up task, but I don't think we should let it compete with core feature time before the deadline.

### 9.2 Development & Testing Deployment

Vercel, connected to our GitHub repo, with automatic preview deployments on every branch and a production
deployment on the main branch. This gives the group a live link to check progress and test features throughout the
two weeks, exactly as you asked for.

### 9.3 Production Deployment

Same Vercel deployment, promoted to the custom production domain once we're feature-complete and tested, with
PWA install prompts enabled. Supabase runs as the managed backend in both environments, with separate
development and production projects so testing never touches real salon data.

## 10. Scalability Considerations for Future Commercialization

- Multi-tenancy is built in from day one via business_id scoping, not retrofitted later.
- Services, inventory items, and expense categories are configurable per business rather than hardcoded, so
  onboarding a second salon — or a different type of small business entirely — doesn't require code changes.
- The forecasting module has a clean interface so we can swap or add methods (Section 7.4) without touching the
  rest of the system.

- Supabase and Vercel both scale from a single free-tier deployment to a paid, higher-capacity setup without a
  migration — we're not building on infrastructure we'll have to abandon.
- The AI companion's context-building step is designed to work off structured business data rather than
  salon-specific assumptions, so it generalizes to other business types with only prompt-level changes.

## 11. Potential Risks, Limitations & Recommendations

```
Risk Recommendation
Two-week timeline vs. scope Treat notifications and advanced DSS rules as stretch goals; core forecasting + import
+ export + AI companion is the must-have set
"Downloadable app"
expectation mismatch
Align on PWA now (Section 9.1) so there's no surprise at delivery
Small dataset limits forecast
accuracy
Be transparent about this in the thesis — the WMA method is appropriate precisely
because the dataset is small; frame it as a documented limitation, not a flaw
Excel formats vary business
to business
The column-mapping step in the import flow (Section 6.7) is what prevents this from
breaking on a differently-formatted file
Gemini API cost or rate limits
at scale
Keep AI calls scoped and cached where possible; monitor usage during testing
Data privacy for a real
operating business
The RBAC and audit logging in Section 8 aren't optional extras — they protect the
salon owner's actual financial data
Single point of contact (me)
building this in 2 weeks
I'll flag early if any specific feature is at risk of slipping, rather than at the end —
better to descope early than deliver something broken
```

## 12. Final Note

This reflects my current understanding of what we're building, based on our discussions so far. I'd like everyone in the
group to review it and confirm we're aligned, especially on the PWA-vs-native decision in Section 9, since that's the
one place where what was originally asked for and what I think is realistically achievable by July 18 don't perfectly
match.
