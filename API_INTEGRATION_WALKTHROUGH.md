# ET Computers Ventures – Repair Tracker
## API integration and production-readiness walkthrough

**Audience:** Claude Code (Part A–C), the developer opening the PR (Part D), and whoever has AWS console access (Part E).
**Goal of this PR:** connect the existing HTML/CSS/JS frontend to the live AWS backend (API Gateway + Lambda + DynamoDB + Cognito), make it safe and reliable for daily use, and document the AWS work that cannot be done from the repository.

---

## How to use this file

1. Put this file at the root of the frontend repository.
2. In the repository, start Claude Code and give it this prompt:

   > Read `API_INTEGRATION_WALKTHROUGH.md`. Work through Part C phase by phase on a new branch. Stop at every **CHECKPOINT** and summarise what you found or changed before continuing. Do not run any AWS commands.

3. When all phases are done, use Part D to open the pull request, and work through Part E in the AWS console.

---

## Part A – Context

### What the system does
A repair-tracking web app for ET Computers Ventures, a laptop/desktop repair shop. The owner and one staff member use it, mainly on a laptop, with a phone for taking device photos. Every device that comes in gets a ticket number (`ETC-0042`), and its condition, fault, promised delivery date and repair status are recorded.

### Architecture

```
Browser (HTML/CSS/JS, built with Vite)
   │  login ───────────────► Amazon Cognito (user pool, 2 staff accounts)
   │  API calls + ID token ─► API Gateway (HTTP API, JWT authorizer "cognito-staff")
   │                            └─► Lambda "etc-jobs-api" (Node.js 22, one function, routes by routeKey)
   │                                  └─► DynamoDB table "etc-jobs" (+ StatusIndex, PhoneIndex)
   └─ hosted on S3 + CloudFront (not set up yet; see Part E)
```

### Current state

| Area | State |
|---|---|
| Frontend | Plain HTML/CSS/JS pages built by the shop's developer. **Do not convert to React or any other framework.** |
| `js/auth.js` | Present. Shared setup: configures Cognito via the `aws-amplify` library; exports `login`, `logout`, `requireLogin`, `api`. |
| `js/login.js`, `js/dashboard.js`, `js/intake.js`, `js/job.js`, `js/photos.js` | Present. Written against assumed element IDs (listed at the top of each file), not yet reconciled with the real HTML. |
| DynamoDB, Lambda, API Gateway, Cognito | Created manually in the AWS console. Working, tested with console test events. |
| S3 photo storage, SMS/email notifications, hosting | **Not built yet.** Out of scope for this PR (see Part E). |

---

## Part B – Ground rules for Claude Code

1. **Branch:** create `feature/api-integration` from the default branch. Never commit to the default branch.
2. **Keep the design.** Do not change layout, colours, fonts or copy except where a task says so. Integration means wiring existing elements to data, not redesigning.
3. **No framework migration.** Plain HTML + ES modules + Vite only.
4. **No secrets in git.** `.env` is never committed. Commit `.env.example` with placeholder values.
5. **No AWS changes.** Do not run `aws` CLI commands or edit infrastructure. If something needs changing in AWS, add it to the AWS task list in the PR description.
6. **Safe DOM updates.** Put API data on the page with `textContent`, `value`, or `createElement`, never `innerHTML` or string-built HTML containing data. Customer-entered text must never be able to run as code.
7. **Small, reviewable commits**, one per phase or logical change, with clear messages (`feat:`, `fix:`, `chore:`, `docs:`).
8. **Ask before deleting** any file the developer created.
9. **When the HTML and a script disagree**, prefer adding `id`/`name` attributes to the existing HTML over renaming things across many scripts. Record every such change in `docs/integration-notes.md`.

---

## Part C – Work plan

### Phase 1 – Review and inventory (no code changes)

- [ ] List every HTML page and what it is for (login, dashboard, intake, job detail, photos, other).
- [ ] For each page, list the scripts it loads (including inline `<script>` blocks) and any hard-coded sample data (fake customers, rows, counts).
- [ ] For each of the five page scripts, compare the IDs/names it expects (comment block at the top of each file) with the actual HTML. List every mismatch.
- [ ] Check `js/auth.js` against the contract in Part C.3: it must configure Amplify from `import.meta.env`, and export `login`, `logout`, `requireLogin`, `api`.
- [ ] Check whether `package.json`, `vite.config.js`, `.gitignore` and `.env.example` exist.
- [ ] Write the findings to `docs/integration-notes.md` (create the `docs/` folder).

**CHECKPOINT 1:** summarise the inventory and the mismatch list. Wait for confirmation before changing code.

---

### Phase 2 – Tooling (Vite, multi-page)

- [ ] If missing: `npm init -y`, then `npm i aws-amplify` and `npm i -D vite`.
- [ ] `package.json` scripts:
  ```json
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" }
  ```
- [ ] `vite.config.js`: list **every** HTML page as a build input (use the real file names from Phase 1). Set `build.target` to `es2022`, because the page scripts use top-level `await`, which older targets reject at build time.
  ```js
  import { dirname, resolve } from "node:path";
  import { fileURLToPath } from "node:url";
  import { defineConfig } from "vite";

  const root = dirname(fileURLToPath(import.meta.url));

  export default defineConfig({
    build: {
      target: "es2022",
      rollupOptions: {
        input: {
          dashboard: resolve(root, "index.html"),
          login: resolve(root, "login.html"),
          intake: resolve(root, "intake.html"),
          job: resolve(root, "job.html"),
          photos: resolve(root, "photos.html"),
        },
      },
    },
  });
  ```
- [ ] `.gitignore` contains at least: `node_modules/`, `dist/`, `.env`, `.env.*` (but not `.env.example`), `.DS_Store`.
- [ ] `.env.example`:
  ```
  VITE_API_URL=https://xxxxxxxxxx.execute-api.<region>.amazonaws.com
  VITE_USER_POOL_ID=<region>_XXXXXXXXX
  VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
  ```
- [ ] Every page's script tag uses `type="module"` and an absolute path, e.g. `<script type="module" src="/js/job.js"></script>`. Remove old inline scripts that duplicate what the page script now does.
- [ ] Static files referenced only from JavaScript (not from HTML/CSS) go in `public/` so Vite copies them to `dist/`.
- [ ] `npm run build` completes with no errors and `dist/` contains every page.
- [ ] If the dev server or build reports `global is not defined` (from Amplify), add `define: { global: "globalThis" }` to the Vite config.

**CHECKPOINT 2:** confirm `npm run dev` serves every page at `http://localhost:5173` and `npm run build` succeeds.

---

### Phase 3 – Shared module and API contract

#### C.3 API contract (source of truth)

All routes require `Authorization: Bearer <Cognito ID token>`. All bodies are JSON. Codes (not labels) are sent and received.

| Method & path | Request | Success response |
|---|---|---|
| `GET /jobs` | – | `200 { items: Job[], counts: { UNDER_REPAIR, ON_HOLD, COMPLETED, DELIVERED } }` (active jobs only, soonest promised date first) |
| `GET /jobs?status=X&cursor=…` | `status` = one status code | `200 { items: Job[], cursor?: string }` (50 per page, newest first) |
| `GET /jobs/{ticketNumber}` | – | `200 Job` |
| `POST /jobs` | New-job body (below) | `201 Job` (server sets `ticketNumber`, `status`, `arrivedAt`, `version: 1`) |
| `PATCH /jobs/{ticketNumber}` | `{ version, status?, promisedDate?, diagnosedFault? }` | `200 Job` (updated, `version` + 1) |
| `GET /search?q=…` | `q`: ticket (`etc-49`), phone, or ≥2 chars of a name | `200 { items: Job[] }` |

**Errors** are always `{ "message": "…" }` with:
`400` validation (show the message to the user) · `401` not logged in / expired → go to login · `404` not found · `409` someone else saved the job first → reload the job · `500` server error.

**Enumerations**

| Field | Codes |
|---|---|
| `status` | `UNDER_REPAIR`, `ON_HOLD`, `COMPLETED`, `DELIVERED` |
| `deviceType` | `LAPTOP`, `DESKTOP` |
| `condition.powersOn` | `YES`, `NO`, `NOT_TESTED` |
| `condition.screen` | `OK`, `SCRATCHED`, `CRACKED`, `DEAD_PIXELS`, `NO_DISPLAY` |
| `condition.keyboard` | `OK`, `MISSING_KEYS`, `FAULTY_KEYS` |
| `condition.touchpad` | `OK`, `FAULTY`, `NOT_APPLICABLE` |
| `condition.battery` | `OK`, `WEAK`, `SWOLLEN`, `NOT_CHARGING`, `MISSING` |
| `condition.body` | `OK`, `SCRATCHES`, `DENTS`, `CRACKED`, `HINGE_DAMAGE` |
| `accessories[]` | `CHARGER`, `BAG`, `MOUSE`, `SPARE_BATTERY`, `POWER_CABLE` |

**New-job body (`POST /jobs`)**
Required: `customerName`, `customerPhone` (Nigerian, any format, e.g. `0803 000 4471`), `deviceName`, `deviceType`, all six `condition` keys, `reportedFault`, `promisedDate` (`YYYY-MM-DD`).
Optional: `customerEmail`, `serialNumber`, `modelNumber`, `specs { ram, storage, processor, screenSize }`, `accessories[]`, `accessoriesOther`, `conditionNotes`.

**Job fields returned** also include: `customerPhone` (normalised `+234…`), `arrivedAt` (ISO UTC), `diagnosedFault?`, `photos[]`, `activity[] { at, by, type, from?, to? }`, `version`, `createdBy`, `updatedAt`, `updatedBy`.

#### Tasks

- [ ] **`js/auth.js` – `api()` errors:** throw an `Error` that carries the HTTP status (`err.status = res.status`) and the server `message`. Handle a non-JSON error body and a network failure (show "Cannot reach the server. Check your internet connection.").
- [ ] **`js/auth.js` – 401:** on `401`, redirect to the login page and stop (no further error shown).
- [ ] **`js/auth.js` – login challenge:** if `signIn` returns `nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"`, show: "Your account needs a permanent password. Ask the administrator to set it." (Staff passwords are set as permanent by the admin, so a new-password screen is out of scope.)
- [ ] **Create `js/labels.js`** with the code → label maps for every enumeration above plus a `label(code)` helper. Remove the duplicated maps from `dashboard.js` and `job.js` and import from here instead.
- [ ] **Create `js/format.js`** with:
  - `formatDateTime(iso)` and `formatDate(yyyyMmDd)` using `timeZone: "Africa/Lagos"` and locale `en-NG`.
  - `maskPhone("+2348030004471")` → `"0803 *** 4471"` (used on the dashboard, which customers in the shop may see).
  - `todayInLagos()` → `YYYY-MM-DD` (used for overdue checks and the minimum promised date).
- [ ] Update `job.js` to detect conflicts with `err.status === 409` instead of matching message text.

**CHECKPOINT 3:** show the final `auth.js`, `labels.js`, `format.js`.

---

### Phase 4 – Page integration

Common to every protected page (all except login):
- [ ] First lines: import from `./auth.js`, then `await requireLogin();`.
- [ ] A visible loading state while data loads, and an error area (`#error`) that shows `err.message`.
- [ ] Buttons that send data are disabled while the request is in flight, to prevent double submits.
- [ ] Logout link works on every page that shows the sidebar.
- [ ] All hard-coded sample data (fake names, rows, counts) is removed from the HTML.

**Login page**
- [ ] Wire the form to `login()`. Wrong credentials show "Incorrect email or password".
- [ ] If already signed in, go straight to the dashboard.

**Dashboard (`index.html`)**
- [ ] On load: `GET /jobs` → table rows + the four status counts.
- [ ] Status filter buttons: "All" → `GET /jobs`; a status → `GET /jobs?status=X`. Highlight the active filter.
- [ ] For `DELIVERED`, add a "Load more" button that passes `cursor` while one is returned.
- [ ] Search box: `GET /search?q=` on submit; clearing it restores the "All" view. Show "Type at least 2 characters" without calling the API for shorter input.
- [ ] Each row links to `job.html?ticket=<ticketNumber>` (URL-encoded).
- [ ] Phone shown masked (`maskPhone`), dates via `format.js`.
- [ ] Overdue: promised date before today and status `UNDER_REPAIR` or `ON_HOLD` → marked overdue (red text plus the word "overdue", not colour alone).
- [ ] Empty state: "No jobs found".

**Intake (`intake.html`)**
- [ ] Inputs carry the `name` attributes listed at the top of `intake.js`; selects/radios/checkboxes use the **codes** as `value`, labels stay human-readable.
- [ ] Required fields marked with HTML `required`; `promisedDate` has `min` set to `todayInLagos()`.
- [ ] Device type "Desktop" defaults touchpad to `NOT_APPLICABLE`.
- [ ] Submit → `POST /jobs`. On `400`, show the server message next to the form and keep everything the user typed. On success → `job.html?ticket=<new ticket>&new=1`.

**Job detail (`job.html?ticket=…`)**
- [ ] Load `GET /jobs/{ticket}` and fill every section: customer (full phone here, as a `tel:` link), device, reported fault, condition at arrival (specs, checklist, accessories, notes), status, promised date, diagnosed fault, history (newest first, readable sentences, Lagos time).
- [ ] Missing or unknown ticket → "Job not found" with a link back to the dashboard.
- [ ] Save → `PATCH` with `version` plus `status`, `promisedDate`, `diagnosedFault`. On success re-render from the response. On `409` show "This job was updated by someone else. The latest version has been loaded." and reload.
- [ ] When `new=1`: show "Device registered as ETC-XXXX." **Do not** say the customer was notified; notifications are not built yet.
- [ ] Show a QR code linking to `${location.origin}/photos.html?ticket=<ticket>` (use the `qrcode` npm package, rendered to a `<canvas>`). Note in `docs/integration-notes.md` that the QR only works from a phone once the site is hosted, not from `localhost`.

**Photos (`photos.html?ticket=…`)**
- [ ] Load the job and show ticket, device and customer name. Must work well at phone width (390px).
- [ ] The upload button is shown disabled with the text "Photo upload coming soon". Photo upload is a separate PR (see Part E, step E3).

**CHECKPOINT 4:** list each page with what was wired, and any deviations from this plan.

---

### Phase 5 – Hardening and clean-up

- [ ] Search the codebase for `innerHTML`, `insertAdjacentHTML`, `outerHTML` and `document.write`. None may contain API data. Replace with safe DOM methods.
- [ ] No `console.log` of tokens, passwords or full job objects. Keep only meaningful `console.error` calls.
- [ ] All `<button>`s inside forms have an explicit `type`. Inputs have associated `<label>`s.
- [ ] Every page title (`<title>`) is set and meaningful.
- [ ] Remove dead code, unused files and leftover mock data. Ask before deleting files the developer created.
- [ ] Add a `README.md` section: prerequisites (Node LTS), `cp .env.example .env`, `npm install`, `npm run dev`, `npm run build`, and where each AWS value comes from.

**CHECKPOINT 5:** summarise the hardening changes.

---

### Phase 6 – Verification

Run `npm run build`, then `npm run preview`, and also test with `npm run dev`. Use a real staff login. Record results in `docs/integration-notes.md`.

| # | Test | Expected |
|---|---|---|
| 1 | Open any page while logged out | Redirected to login |
| 2 | Wrong password | "Incorrect email or password" |
| 3 | Correct login | Dashboard shows real jobs and counts |
| 4 | Each status filter, including Delivered + Load more | Correct jobs only |
| 5 | Search: `etc-1`, a phone number in local format, part of a name, 1 character | Correct results; 1 character shows the hint, no API call |
| 6 | Register a device with valid data | Lands on new job page with next ETC number; counts updated on dashboard |
| 7 | Register with an invalid phone (`12345`) | Server message shown; form input kept |
| 8 | Double-click Register | Only one job created |
| 9 | Change status + promised date + diagnosis, Save | Values saved; three history entries |
| 10 | Open the same job in two tabs, save in tab A, then save in tab B | Tab B shows the conflict message and reloads |
| 11 | Unknown ticket `job.html?ticket=ETC-9999` | "Job not found" |
| 12 | Name containing `<b>test</b>` | Shown as plain text, not bold |
| 13 | Photos page at 390px width | Readable, no horizontal scroll |
| 14 | Log out, press browser Back | Redirected to login |

**CHECKPOINT 6:** report the results, including any failures.

---

## Part D – Pull request

### Branch and commits
Branch `feature/api-integration`, one commit per phase. Push and open the PR against the default branch (`gh pr create` or the GitHub website). Add the developer as reviewer.

### PR description template

```markdown
## Summary
Connects the frontend to the live AWS backend (Cognito login, API Gateway + Lambda + DynamoDB).
No visual redesign; existing pages are wired to real data.

## What changed
- Vite build setup (multi-page), `.env.example`, `.gitignore`
- Shared `js/auth.js` (login/session/API calls), `js/labels.js`, `js/format.js`
- Page scripts: login, dashboard, intake, job detail, photos
- HTML: added `id`/`name` attributes and module script tags; removed sample data
- Full list of HTML changes: docs/integration-notes.md

## How to test
1. `cp .env.example .env` and fill in the three values (ask the repo owner)
2. `npm install && npm run dev`, then open http://localhost:5173
3. Log in with a staff account and follow the checklist in docs/integration-notes.md

## Screenshots
Dashboard · Intake · Job detail · Photos (phone width)

## AWS tasks (outside this repo)
See the checklist in API_INTEGRATION_WALKTHROUGH.md, Part E. Items E1 must be done before testing.

## Out of scope (follow-up PRs)
- Photo upload (S3)
- SMS/email notifications (SNS/SES)
- Hosting (S3 + CloudFront)

## Risks / rollback
Frontend-only change; revert the merge commit to roll back. No data migrations.
```

---

## Part E – AWS tasks (manual, console)

These cannot be done from the repository. Tick them off in the PR.

### E1 – Before testing this PR

- [ ] **Lambda `etc-jobs-api`:** latest code with all five routes is deployed; timeout 10 s; memory 256 MB; env var `JOBS_TABLE_NAME=etc-jobs`.
- [ ] **Lambda IAM policy** allows `GetItem, PutItem, UpdateItem, Query, Scan` on the table ARN **and** `<table ARN>/index/*`.
- [ ] **Lambda resource-based policy** lets API Gateway invoke it for all routes (source ARN ends in `/*/*`).
- [ ] **API Gateway routes exist and each has the `cognito-staff` authorizer attached:** `GET /jobs`, `POST /jobs`, `GET /jobs/{ticketNumber}`, `PATCH /jobs/{ticketNumber}`, `GET /search`. Check: opening `<API URL>/jobs` in a browser returns `401 Unauthorized`.
- [ ] **API Gateway CORS:** allowed origins include `http://localhost:5173` (and the preview port `http://localhost:4173` if used); methods `GET, POST, PATCH, OPTIONS`; headers `authorization, content-type`.
- [ ] **API Gateway throttling** on the `$default` stage (e.g. rate 10, burst 20).
- [ ] **Cognito:** both staff users show status *Confirmed* (permanent password set); self-registration is off; App client ID and User pool ID shared privately with the developer for `.env`.

### E2 – Before real customer data is entered (go-live)

- [ ] Delete all test items from `etc-jobs` (anything not a real job).
- [ ] Set the counter item `COUNTER#TICKET` → `lastNumber` to the last number used in the paper notebook (or `0`).
- [ ] Confirm DynamoDB **point-in-time recovery** and **deletion protection** are on.
- [ ] **Monitoring:** CloudWatch alarm on Lambda `Errors > 0` (5-minute period) emailing the owner; an AWS Budgets alert (e.g. $10/month).
- [ ] **Hosting (separate PR/task):**
  - Private S3 bucket for the site; CloudFront distribution with Origin Access Control; HTTPS; default root object `index.html`.
  - This is a multi-page site, so **no** "redirect all 404s to index.html" rule is needed (that is only for single-page apps).
  - Cache policy: HTML not cached (or short TTL); `/assets/*` (hashed by Vite) cached long.
  - Response headers policy with security headers (HSTS, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy). If a Content-Security-Policy is added, `connect-src` must allow the API URL and `https://cognito-idp.<region>.amazonaws.com`.
  - Add the CloudFront domain (and custom domain, if any) to the API Gateway CORS allowed origins.
  - Deploy: `npm run build`, then `aws s3 sync dist/ s3://<site-bucket> --delete`, then `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"`.
  - Optional custom domain: ACM certificate in **us-east-1** (required for CloudFront), DNS record to the distribution.

### E3 – Follow-up features (separate PRs)

- [ ] **Photo upload (S3):**
  - Private bucket `etc-device-photos-<suffix>` with Block Public Access on and bucket CORS allowing `PUT` from the site origins.
  - New routes `POST /jobs/{ticketNumber}/photo-url` (returns a pre-signed PUT URL) and `POST /jobs/{ticketNumber}/photos` (records the key on the job + activity entry).
  - Job responses include short-lived pre-signed GET URLs for display.
  - Lambda IAM: `s3:PutObject`, `s3:GetObject` on the bucket.
  - Frontend: phone camera capture, client-side compression, upload progress.
- [ ] **Notifications:**
  - Notify Lambda triggered by the DynamoDB stream (new and old images).
  - SMS via SNS on: registration, promised date change, Completed.
  - Email via SES on: registration, Completed (only when the customer gave an email).
  - SES: verify a sending domain and request production access (sandbox can only email verified addresses).
  - SNS: check Nigeria SMS sender-ID requirements and set a monthly SMS spend limit.
  - Only once this is live should the UI say "Customer has been notified".

---

## Definition of done (this PR)

- All Part C checkboxes complete, or a deviation explained in `docs/integration-notes.md`.
- `npm run build` succeeds; all Phase 6 tests pass against the live API.
- No secrets committed; `.env.example` present; README updated.
- No `innerHTML` with API data anywhere.
- PR opened with the description template, screenshots, and Part E checklist.
