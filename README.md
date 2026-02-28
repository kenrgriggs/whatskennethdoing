# What's Kenneth Doing?

Internal transparency tool for tracking live work, reviewing task history, and seeing category-level analytics.

This repo is a Next.js + Prisma app that currently tracks one subject user (configured by env var) and supports read-only vs owner edit behavior for viewers.

## What This App Does

- Shows the current active task in real time.
- Lets the owner start/stop tasks and create historical entries.
- Stores all events in SQLite through Prisma.
- Provides an editable history table with:
  - sorting, filtering, pagination
  - inline cell editing
  - per-column icons and controls
  - column reorder + resize
  - saved views (add, rename, duplicate, delete, copy link)
  - table settings (records/page, sort, refresh frequency, density)
- Provides an analytics page with today/week totals and category breakdown.
- Includes a persistent hamburger sidebar navigation across routes.
- Includes a placeholder `/account` page for future account features.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Prisma 7 + `@prisma/adapter-better-sqlite3`
- SQLite (local file db)
- Tailwind CSS 4
- ESLint 9

## Project Structure

```text
app/
  page.tsx                     Dashboard (Now + History)
  analytics/page.tsx           Analytics page
  account/page.tsx             Account placeholder page
  layout.tsx                   Global shell + persistent navigation
  globals.css                  Global dark theme, scrollbar, nav offset rules
  api/activity/
    current/route.ts           GET current, POST create/set current task
    stop/route.ts              POST stop current task
    events/route.ts            GET history, PATCH edit history rows
    suggestions/route.ts       GET task/category/notes suggestions
    analytics/route.ts         GET today/week aggregates

components/
  NavigationMenu.tsx           Hamburger + sidebar + pin behavior
  NowCard.tsx                  Active task card + create-task modal + floating +
  HistoryCard.tsx              History table + editing + filters + saved views
  AnalyticsCard.tsx            Analytics summaries and category bars

lib/
  db.ts                        Prisma client setup (better-sqlite3 adapter)
  auth.ts                      Dev auth/role model for subject/viewer
  activity-types.ts            Category normalization + color styling helpers

prisma/
  schema.prisma                Data model
  migrations/                  SQL migrations
```

## Routes

- `/` Dashboard
  - Header + refresh all
  - `NowCard`
  - `HistoryCard`
- `/analytics`
  - `AnalyticsCard` totals and breakdowns
- `/account`
  - Placeholder page for future account settings

## API Reference

### `GET /api/activity/current`

- Returns active task for `SUBJECT_UPN`.
- For non-owner viewers, redacted tasks hide sensitive fields.

### `POST /api/activity/current` (owner only)

- Creates a new event and updates `ActiveActivity`.
- If `endTime` is included, creates a closed event and clears active state.
- Accepts `status`, `title`, `category` (or `type`), `notes`, `startTime`, `endTime`, plus optional redaction fields.

### `POST /api/activity/stop` (owner only)

- Closes open event (`endedAt = now`) and clears `ActiveActivity`.

### `GET /api/activity/events`

- Returns recent history events (up to 300).
- Applies redaction for non-owner viewers.

### `PATCH /api/activity/events` (owner only)

- Updates one event row from History table edits.
- Validates date and status changes.
- Synchronizes `ActiveActivity` when editing an open event.

### `GET /api/activity/suggestions` (owner only)

- Returns recent unique task titles/categories and task->notes pairs for quick entry.

### `GET /api/activity/analytics`

- Aggregates minutes per category for:
  - today (local day)
  - this week (Mon -> now, local time)

## Data Model (Prisma)

### `ActiveActivity`

Current in-progress task for the subject user.

Key fields:
- `userUpn`, `title`, `type` (category), `status`
- `project`, `notes`, `referenceId`
- `startedAt`, `lastHeartbeatAt`
- `visibility`, `redactedLabel`

### `ActivityEvent`

Historical event records (open or closed).

Key fields:
- `userUpn`, `title`, `type`, `status`
- `project`, `notes`, `referenceId`
- `startedAt`, `endedAt`
- `visibility`, `redactedLabel`

### Enums

- `TaskStatus`: `NOT_STARTED`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`
- `Visibility`: `PUBLIC`, `REDACTED`

## Auth Model (Current, Dev-Oriented)

There is no full account/auth integration yet.

The app currently uses env vars to determine:
- subject being tracked
- viewer identity
- viewer role (`BASIC`, `MANAGER`, `OWNER`)

Write operations are owner-only in API routes.

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env` (or update your existing one):

```bash
DATABASE_URL="file:./dev.db"
SUBJECT_UPN="kenneth"
OWNER_UPN="kenneth"
DEV_VIEWER_UPN="kenneth"
# Optional:
# DEV_VIEWER_ROLE="MANAGER"
```

Notes:
- `SUBJECT_UPN` = whose timeline is tracked.
- `DEV_VIEWER_UPN` = who is currently viewing.
- If `DEV_VIEWER_UPN` matches `OWNER_UPN`, viewer is treated as owner.

### 3. Generate Prisma client and apply migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Run app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Common Commands

```bash
npm run dev      # Start dev server
npm run lint     # Run ESLint
npm run build    # Production build
npm run start    # Start production server
```

## How It Works Day To Day

1. Start work in the `Now` card (`New Task` or floating `+`).
2. Stop work with `Stop` (or create historical entries with explicit end time).
3. Use `History` to filter, edit, and save reusable table views.
4. Use `Analytics` for today/week category totals.
5. Navigate between pages from the persistent sidebar menu.

## Browser Persistence

History UI stores some preferences in `localStorage`, including:

- column order
- saved history views

These are local to the browser profile/machine.

## Known Limitations

- No real account/auth provider yet (env-based dev model only).
- `/account` is a placeholder page.
- No automated test suite is set up yet.
- App metadata in `app/layout.tsx` still contains default placeholder values.

## Troubleshooting

### Prisma or schema mismatch errors

If you see errors like unknown Prisma fields:

```bash
npx prisma generate
npx prisma migrate deploy
```

Then restart the dev server.

### DB reset for local development

If local data is disposable and you want a clean start:

```bash
npx prisma migrate reset
```

This will drop and recreate the local database.

---

If you want, this README can also be split into:
- `README.md` (overview + quickstart)
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
