# Mathematics Data Entry Portal

A portal for one Mathematics teacher (Classes 1B–1H) to record continuous assessment and examination marks, keep
historical academic records, import students from Excel/CSV, monitor performance and export reports. Students can sign
in with their Student ID to see their own results (read-only).

| Layer | Technology |
| --- | --- |
| Backend | NestJS 12 · TypeScript · Express 5 · PostgreSQL · TypeORM (migrations) · Bun |
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui-style components (Radix) |
| Support | TanStack Query · React Hook Form · Zod · ExcelJS · Socket.IO · Argon2id (via `Bun.password`, no extra package) · Postman |

## Requirements

- [Bun](https://bun.sh) 1.4+ (runs the TypeScript backend directly and installs packages)
- PostgreSQL (developed and tested against 16) running locally

## Setup

```bash
# 1. Database (once)
createdb mathportal            # or: psql -c "create database mathportal"
createdb mathportal_test       # only needed to run the backend test suite

# 2. Backend
cd backend
# Use the existing .env file; adjust DATABASE_URL for the local PostgreSQL database if needed.
bun install
bun run migration:run          # creates the schema and the fixed reference data (classes 1B-1H, assessment categories)
bun run seed:teacher -- --name "Your Full Name"    # creates the teacher account (there is no public registration)
bun run start                  # API on http://localhost:3000 (Socket.IO at /api/socket.io)

# 3. Frontend (another terminal)
cd frontend
bun install
bun run dev                    # http://localhost:5173 (Vite proxies /api to the backend)
```

Sign in at http://localhost:5173 with the registered name. Then:

1. **Academic years**: create the first year (for example `2026/2027`, it becomes the active year).
2. **Import students**: download the template, fill in *Student ID, Student Name, Class, Section*, upload it, review the
   preview, confirm. Students can also be added one by one on the Students page.
3. **Assessments / Examinations**: enter marks. Create an examination for each term and set its maximum marks.
4. **Reports**: download Excel files; **Analytics / Rankings / Dashboard** are computed from the entered marks.

A student signs in with their **Student ID** only and lands on a read-only results page.

Optional hardening: `seed:teacher -- --name "…" --passcode "at-least-8-chars"` (or `PUT /api/teachers/me/passcode`) adds an
Argon2-hashed passcode that is then required in addition to the name. See *Known limitations*.

### Environment (`backend/.env`)

The existing `backend/.env` is the single local configuration file. `DATABASE_URL` and `APP_ORIGIN` are required;
other settings are documented and validated by `backend/src/config/env.ts`. `APP_ORIGIN`
contains the browser origin(s) of the frontend for the CSRF Origin check and Socket.IO. Other settings include
`TRUST_PROXY` (reverse-proxy hops, so rate limiting sees real client IPs), `COOKIE_SECURE` (defaults to true in
production), `STUDENT_ID_PATTERN` (adjust to the school's real ID format), and the login rate-limit settings.

### Production

```bash
cd frontend && bun run build           # type-checks, then writes frontend/dist
cd backend && NODE_ENV=production bun run start
```

Serve `frontend/dist` and route `/api/*` (including WebSocket upgrades on `/api/socket.io`) to the backend from the
**same origin** (nginx, Caddy, ...). Set `NODE_ENV=production`, `APP_ORIGIN=https://your-domain`, `TRUST_PROXY=<hops>`
and use HTTPS (cookies are `Secure` in production). Run `bun run migration:run` on every deploy. The backend's `build`
script is a type-check because Bun executes the TypeScript directly.

Keep one local environment file at `backend/.env`; it is ignored by Git and must not contain committed production
secrets. On Render, set the same variable names in the backend web service Environment settings; Render does not read
the local `.env` file. Set `APP_ORIGIN` to the exact frontend origin URL(s) in Render's backend web service settings.

## Tests

```bash
cd backend  && NODE_ENV=test bun run migration:run && bun test    # integration tests: HTTP, PostgreSQL, WebSockets
cd frontend && bun run typecheck && bun run test && bun run build  # type-check, 44 unit tests, production build
```

The backend suite resets only a database whose name ends in `_test` (it refuses anything else). Use the existing
`backend/.env` for test settings as well; do not create a separate environment file.

**End-to-end (browser)** – `e2e/run.cjs` drives the real UI against the real API and database with Playwright: login,
academic year, Excel/CSV import (errors, duplicates), mark entry and validation, two-tab conflict, finalization and
corrections with history, examinations with a teacher-chosen maximum, analytics, Excel downloads, dark mode, mobile
layout, sign-out and the student's read-only view. It needs a **clean database** and a running stack:

```bash
# fresh DB + teacher, start `bun run start` (backend) and `bun run dev` (frontend), then:
cd backend && bun run seed:teacher -- --name "Ms E2E Teacher"
cd e2e && bun add -d playwright && bunx playwright install chromium   # once
E2E_BASE=http://127.0.0.1:5173 node run.cjs                          # screenshots land in e2e/output/
```

**Postman** – import `postman/Mathematics-Portal.postman_collection.json`. Run it top to bottom (Collection Runner) or
request by request; it stores the CSRF token and the ids it needs. Only the two import requests need a file chosen
manually.

## What the system guarantees

- **Fixed 30-mark assessment**: Class Activities 9, Homeworks and Assignments 6, Learning Materials and Notebook 10,
  Textbook 5. Limits are enforced in the UI, the API (Zod) and the database (CHECK constraints).
- **Examination maximums are never hardcoded**: the teacher sets them per examination (Term 1, Term 2, Final Term 3); a
  mark above the maximum is rejected everywhere.
- **Missing is not zero**: an absent mark stays absent in the database, the UI, analytics and Excel files (blank cell). A
  real `0` is stored and shown as `0`. Each result is `missing`, `partial`, `entered` or `finalized`.
- **No duplicate or lost records**: one assessment record per student/term, one mark per student/examination. Saves run in
  a transaction with row locks and an optimistic `version`, so two tabs can never silently overwrite each other.
- **Finalization and history**: finalized marks are locked; changing one (or anything in a closed year) needs a written
  correction reason. Every change is kept in an append-only history/audit log (database triggers forbid editing or
  deleting audit rows and deleting finalized marks).
- **Academic years are never deleted**. Closing a year makes it read-only. A returning student keeps one identity across
  years, so progression and history are available on the student profile.
- **Teachers see only their own sections** and students only themselves; authorization is enforced on the server for
  every route (default-deny guard), not by hiding buttons.
- **Imports preview before saving**: the file is validated (header aliases, duplicates inside the file, unknown
  sections, existing enrollments) and nothing is written until the teacher confirms; the confirmation is single-use,
  expires after 30 minutes and is re-validated inside the transaction.

### How results are calculated

Results are **computed from the stored marks, never stored**, so a correction is reflected everywhere at once. The
specification defines no combined grading formula, so none is invented:

- Assessment percentage = total / 30 (only when all four categories are entered). Examination percentage = mark /
  that examination's maximum.
- A term's average is the mean of that term's *complete* percentages; the **performance index** is the mean of the term
  averages that exist. It is a monitoring aid, not a grade or a pass mark.
- Rankings use competition ranking (ties share a rank) with name as the tie-break for ordering; students without a
  complete result are listed separately as unranked, never ranked last as zero.
- Monitoring groups (shown to the teacher only): exceptional ≥ 85%, low < 50%, may need support < 40% or declining while
  < 60%; trend compares term averages with a 5-point band. These thresholds are constants in
  `backend/src/results/` and easy to change.

## Project layout

```
backend/   src/{auth,security,students,academic-years,assessments,examinations,marks,results,analytics,rankings,
                excel,reports,events,teachers,sections,classes,database,common,config}  test/
frontend/  src/{pages,components,layouts,hooks,auth,theme,lib}
e2e/       Playwright end-to-end suite and its fixture
postman/   API collection
```

## Known limitations

- **Authentication is weak by specification.** The specification asks for teacher sign-in by registered name only and
  student sign-in by Student ID only, with no passwords. Anyone who knows a name or an ID can sign in as that person.
  It is mitigated (failed sign-ins are counted per name/Student ID and per IP in PostgreSQL, 10 per identifier in 15 minutes
  by default; secure HttpOnly sessions; CSRF protection; server-side authorization; students limited to their own data)
  but not removed. The per-identifier lockout has a cost: someone who knows the teacher's name can deliberately lock that
  sign-in for the window. The optional teacher passcode closes the largest
  gap; for a real deployment add a passcode and keep the portal on a trusted network or behind SSO.
- **One assessment per term** is assumed (the specification's four categories are scored once for each of Term 1,
  Term 2 and Final Term 3). Several examinations per term are supported.
- Students see marks that are **entered or finalized**, and a missing mark is shown as missing. Finalizing is a teacher
  action that locks the marks; it is not required for a student to see a mark.
- The shadcn/ui components are hand-written in the shadcn style on Radix (the shadcn registry was not reachable when the
  project was built), so the components are not updated by the shadcn CLI.
- There is no UI for changing the teacher passcode; use the seed command or the API.
- The browser end-to-end suite and the Postman run were executed against a local stack during development; they are not
  wired into CI.
