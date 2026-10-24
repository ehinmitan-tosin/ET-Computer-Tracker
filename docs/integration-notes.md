# Integration notes

Working notes for the `feature/api-integration` branch (see `API_INTEGRATION_WALKTHROUGH.md`, Part C).

## Phase 1 – Inventory (2026-10-23)

### Summary

The repository does not match the "current state" described in the walkthrough (Part A):

1. **The pages are not plain HTML.** Every `site/*.html` file is a self-unpacking export from a
   design-canvas tool. Each file is about 310–330 KB and contains:
   - a loader script that runs on `DOMContentLoaded`, decodes a gzipped/base64 manifest, and
     **replaces the whole document** (`document.documentElement.replaceWith(...)`) with a template;
   - an embedded copy of React 18.3.1 + ReactDOM (UMD) and a ~45 KB "DC" runtime;
   - 11 embedded IBM Plex woff2 fonts;
   - the real page markup inside a JSON-escaped `<script type="__bundler/template">`, written in
     the tool's template language (`<x-dc>`, `<sc-for list="{{rows}}">`, `{{r.name}}`,
     `sc-camel-on-click`, `<sc-raw-table>`), with page logic in a `class Component extends DCLogic`.
2. **The page scripts are empty.** `site/js/Intake.js`, `Job.js`, `Login.js`, `Main.js`,
   `Phone.js`, `Saved.js` and `index.js` are all 0 bytes. There are no "expected IDs" comment
   blocks to compare against.
3. **No element in any page has an `id` or `name`.** Forms have no submit buttons (the "Sign in"
   and "Register device" controls are `<a href>` links to the next mock page).
4. **The module script tags would not work even if the scripts existed.** The
   `<script type="module" src="/js/…">` tag sits in the outer wrapper, outside the template. The
   loader throws the wrapper away when it swaps in the template, and React then renders and
   re-renders the DOM, so DOM changes made by an outside script would be lost.
5. **A real `.env` is committed** (`site/.env`, added in commit `2f2d4b0`). It is also inside
   `site.zip`. It holds the live API URL, user pool ID and app client ID.

### Pages

| File | Purpose (from content) | Walkthrough name | Title | Script tag in wrapper | Hard-coded sample data |
|---|---|---|---|---|---|
| `site/index.html` | **Login** (byte-identical template to `Login.dc.html`) | `index.html` = dashboard | Staff login | `/js/dashboard.js` (missing) **and** `/js/index.js` (empty) | — |
| `site/Login.dc.html` | Login | `login.html` | Staff login | `/js/login.js` (wrong case; file is `Login.js`, so it 404s on Linux/S3) | Placeholder `you@etcomputers.ng` only |
| `site/Main.dc.html` | Dashboard | `index.html` | Dashboard | `/js/Main.js` | 8 fake jobs (`ETC-0042`–`ETC-0049`, names, masked phones, faults, dates), counts derived from them, date "Thursday, 8 October 2026", "[Technician name]" / "Admin" |
| `site/Intake.dc.html` | New intake | `intake.html` | New intake | `/js/Intake.js` | Arrival "8 Oct 2026, 23:42"; preselected condition (screen No display, battery Weak, body Scratches) and accessories (Charger, Bag); example `ETC-0050` |
| `site/JobDetail.dc.html` | Job detail | `job.html` | Job ETC-0049 | `/js/Main.js` (**wrong**: dashboard script) | Whole job ETC-0049 (Adaeze Okafor, phone, email, device, fault, diagnosis, specs, accessories, notes, promised 2026-10-10, 4 photos, 4 history entries) |
| `site/Phone.dc.html` | Photos (phone, 390 px) | `photos.html` | Photos for ETC-0050 | `/js/Phone.js` | ETC-0050 job card, "Uploaded · 3", fake 62% upload progress, "Compressed from 4.1 MB to 380 KB" |
| `site/Saved.dc.html` | "Device registered" confirmation | *(none; plan uses `job.html?new=1`)* | Intake saved | `/js/Saved.js` | ETC-0050 summary, "Customer notified · SMS sent… Email sent…", **fake QR** (pseudo-random 21×21 grid), `[your-domain]/jobs/ETC-0050/photos` |

Inline scripts on every page: the bundler loader, the embedded runtime/React, and one
`text/x-dc` component script (holding the mock data listed above).

### Page scripts vs HTML

None of the scripts the walkthrough describes exists with content, so the comparison is between
what the walkthrough's tasks need and what the markup provides:

| Page | What the tasks need | What the markup has |
|---|---|---|
| Login | form submit, email/password fields, error area | `<form>` without `id`; inputs with no `id`/`name`; "Sign in" is `<a href="Main.dc.html">`, not a submit button; no error area |
| Dashboard | count elements, filter buttons, table body, search form, load-more, `#error`, loading state | counts/filters/rows rendered by `sc-for` from mock arrays; search `<input type="search">` not inside a form, no `name`; no load-more, error or loading elements; row links all go to `JobDetail.dc.html` |
| Intake | inputs with `name`s, code values on radios/checkboxes, `required`, submit | text inputs with no `name`; device type, condition and accessories are `<button>` pills with **labels** as state, not form controls with code values; no `required` attributes ("*" in label text only); "Register device" is a link; no `<form>` element at all |
| Job detail | fields to fill, status control, date, diagnosis, save, history, QR canvas, `#error` | all values hard-coded; status pills are buttons bound to component state; Save is `type="button"` with no handler; photos grid is mock; no QR element |
| Photos | ticket/device/customer fields, disabled upload button | hard-coded values; "Take photo" button active; mock progress bar and thumbnails |
| Saved | *(not in plan)* | duplicates what the plan puts on `job.html?new=1` |

Nav/link mismatches: sidebar "All jobs" points at `JobDetail.dc.html`; "Log out" is a plain link
to `Login.dc.html` (does not sign out); links use `*.dc.html` names, the plan uses
`index/login/intake/job/photos.html`.

### Copy that conflicts with the walkthrough

Notifications are not built (Part E3), but the designs say they are:
- Intake sidebar: "Customer gets an SMS (and email, if given)…"; phone hint "SMS updates go to this number"; email hint "If given, email updates are sent too".
- Job detail: "Changing this date sends the customer an SMS with the new date."; Completed note "Saving sends the customer an SMS (and email)…"; history entries "· SMS sent".
- Saved page: "Customer notified · SMS sent to … · Email sent to …".
- Saved page shows a fake QR and a URL format (`/jobs/ETC-0050/photos`) that differs from the plan (`/photos.html?ticket=`).

### `js/auth.js` vs contract (C.3)

| Requirement | State |
|---|---|
| Configures Amplify from `import.meta.env` | Yes (`VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`) |
| Exports `login`, `logout`, `requireLogin`, `api` | Yes, all four |
| `api()` error carries `err.status` and server `message` | No: `new Error(data.message)` only |
| Non-JSON error body / network failure | Not handled (`res.json()` throws a SyntaxError; `fetch` TypeError propagates) |
| 401 → login and stop | Redirects but `return`s `undefined`, so callers continue with no data |
| `requireLogin` stops the page | Redirects but resolves normally, so the page keeps running |
| `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED` | Not handled; `login` silently does nothing |
| Already-signed-in on login | Not handled (`signIn` throws `UserAlreadyAuthenticatedException`) |
| Redirect targets | `/login.html`, `/index.html`, which don't exist with the current file names |
| Missing ID token | Sends `Bearer undefined` |
| `Content-Type` header | Always set, also overwrites any caller `headers` |

### Tooling files

| File | State |
|---|---|
| `package.json` (repo root) | Exists. `aws-amplify ^6.22.2`, `vite ^8.3.4`. Has `dev`/`build`, **no `preview`**. `"type": "commonjs"`. `description` contains garbled UTF-16 text. No `qrcode`. |
| `package-lock.json` | Exists. `node_modules/` not installed. |
| `vite.config.js` | In `site/`, but `package.json` is at the repo root, so `npm run dev` from the root would not find it. Inputs reference **non-existent** files `login.dc.html` and `Job.dc.html` (actual: `Login.dc.html`, `JobDetail.dc.html`). No `build.target`. |
| `.gitignore` | Exists, contains only `node_modules`. Missing `dist/`, `.env`, `.env.*`, `!.env.example`, `.DS_Store`. |
| `.env.example` | **Missing.** |
| `site/.env` | **Committed** (should be removed from git and the values rotated if considered sensitive). Uses `KEY = value` with spaces around `=`. |
| `README.md` | UTF-16 LE with CRLF; contains only the title. |
| `site.zip` | Older copy of the whole `site/` folder (CRLF line endings), including `.env`. |

Environment: Node v22.23.1, npm 10.9.8.

## Phase 2 – Tooling and page conversion (2026-10-23)

Decisions confirmed by the repo owner after Checkpoint 1:
- Rebuild the design exports as plain HTML (option a). Layout, colours, fonts and copy are kept;
  the design tool's runtime and embedded React are dropped.
- Rename pages to the plan's names; the "Device registered" page is folded into `job.html?new=1`.
- Notification wording is removed for now (notifications come after the CRUD app).

### Project layout
- `package.json` and `vite.config.js` are at the repo root; Vite's `root` is `site/`, so
  `.env`, `.env.example` and `public/` live in `site/`. Build output goes to `dist/` at the repo root.
- `package.json`: added `preview` script, `"type": "module"`, `"private": true`; fixed the garbled
  `description` and the name. `vite.config.js`: real file names, `build.target: "es2022"`.
- `.gitignore`: `node_modules/`, `dist/`, `.env`, `.env.*`, `!.env.example`, `.DS_Store`.
- `site/.env` removed from git tracking (file kept locally). Its values are still in git history
  and in `site.zip`, so the app client should be rotated (added to the AWS task list).
- `define: { global: "globalThis" }` was **not** needed: a page importing `auth.js` (Amplify v6)
  loads in Chrome with no console errors, and the build succeeds.
- Fonts: the latin subsets of IBM Plex Sans (variable, 400–600) and IBM Plex Mono (400, 500) were
  extracted from the export into `site/fonts/` and are self-hosted. Non-latin text falls back to
  `system-ui` (the export loaded those subsets from Google Fonts).
- No files are referenced only from JavaScript, so `site/public/` is not needed yet.

### HTML changes (rule 9)

All styling moved from inline `style` attributes to `site/css/styles.css`, with the same values.
State that the export computed in JavaScript (selected pill, active filter, status colours) is now
expressed in CSS through `:checked`, `aria-pressed` and `data-status="<CODE>"`.

| Old file | New file | Changes |
|---|---|---|
| `Login.dc.html` (+ duplicate `index.html`) | `login.html` | `form#login-form`; `input#email[name=email]`, `input#password[name=password]` with `required`; "Sign in" link → `button#submit[type=submit]`; added `#error` |
| `Main.dc.html` | `index.html` | Search wrapped in `form#search-form[role=search]` with `input#search[name=q]` and a real `<label>`; `#search-hint`; stat cards `button.stat[data-status][aria-pressed]` with `[data-count=<CODE>]`; filter chips `button.chip[data-filter=<CODE or "">]`; `tbody#job-rows`; `#shown`; `#error`; added `#load-more` (hidden); `#today`; sample rows, counts and date removed |
| `Intake.dc.html` | `intake.html` | Whole page is `form#intake-form`; every input has the API field `name` (`customerName`, `customerPhone`, `customerEmail`, `deviceName`, `deviceType`, `serialNumber`, `modelNumber`, `specs.ram`, `specs.storage`, `specs.processor`, `specs.screenSize`, `condition.<key>`, `accessories`, `accessoriesOther`, `conditionNotes`, `reportedFault`, `promisedDate`); device type / condition / accessories pills are now visually-hidden radio/checkbox inputs with **code** values inside the pill labels; `required` on required fields; "Register device" → `button#submit[type=submit]`; `#error`; `#arrival-time` |
| `JobDetail.dc.html` | `job.html` | `#loading`, `#error`, `#not-found`, `#job` (hidden until loaded), `#notice` (new-job message); ids for every value (`#ticket`, `#status-badge`, `#summary`, `#reported-fault`, `#diagnosed-fault`, `#specs`, `#accessories`, `#condition-notes`, `#customer-name`, `#customer-phone`, `#customer-email`, `#history`, `#status-note`, `#promised-date`, `#photo-count`); status buttons → `input[name=status]` radios; Save → `button#save[type=submit]` in `form#job-form`; "Show QR to add from phone" now toggles an inline `canvas#qr` (`#qr-box`, `#qr-url`) instead of linking to the photos page |
| `Phone.dc.html` | `photos.html` | Fixed 390×844 preview frame → responsive column (max 480px); `#loading`, `#error`, `#job`, `#ticket`, `#status-badge`, `#device`, `#customer`; "Take photo" → `button#take-photo` disabled with "Photo upload coming soon"; fake uploaded thumbnails and upload progress removed; non-functional menu button removed; "Done" is a link (`#done`) |
| `Saved.dc.html` | *(not built)* | Replaced by `job.html?new=1`. File left in place until deletion is confirmed (Phase 5). |

All pages: `<meta name="viewport">`, `<title>` "Page · ET Computers", stylesheet link, one
`<script type="module" src="/js/<page>.js">` in `<head>`; sidebar links point to the new names;
"[Technician name]" → `#user-name` / `#user-initial` (filled from the session); role "Admin" → "Staff"
(no role data available).

Page scripts renamed: `Main.js` → `dashboard.js`, `Login.js` → `login.js`, `Intake.js` → `intake.js`,
`Job.js` → `job.js`, `Phone.js` → `photos.js` (all still empty). `Saved.js` and `index.js` are
unused and left until deletion is confirmed.

### Copy removed (notifications not built)
- Intake: hint "SMS updates go to this number"; hint "If given, email updates are sent too";
  "When you register" step 02 (customer gets SMS/email); the QR step is renumbered to 02.
- Job: "Changing this date sends the customer an SMS with the new date."; status notes now read
  "Waiting on parts or the customer." (On Hold) and "Device is ready for pickup." (Completed).
- Saved page "Customer notified" block (page not carried over).

### Open questions
- Sidebar "All jobs" pointed at the job-detail mock. It now links to the dashboard (same as
  "Dashboard"); it could become the Delivered/history view later.
- Intake defaults: device type defaults to Laptop (as in the design). Condition rows have **no**
  default, so staff must actively choose each one; the design's pre-selected values were sample data.

## Phase 3 – Shared modules (2026-10-23)

### `js/auth.js`
- Fails fast with a clear message if any `VITE_*` value is missing; trailing `/` on `VITE_API_URL` is tolerated.
- `api(path, { method, body, signal })`: `body` is a plain object sent as JSON (`Content-Type` only
  when there is a body). Errors are `ApiError` with `.status` (HTTP status, or `0` for a network
  failure) and the server's `message`; non-JSON or empty error bodies get a sensible default
  message; network failures say "Cannot reach the server. Check your internet connection."
- `401`, a missing token or an expired session → `location.replace("/login.html?next=<current page>")`
  and the returned promise never settles, so the page stops without showing an error.
- `requireLogin()` resolves with the Amplify user or redirects and never resolves. It also re-checks
  the session when a page is restored from the back/forward cache (walkthrough test 14).
- `login()` maps Cognito errors to user messages ("Incorrect email or password" for wrong
  credentials), handles `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED` with the admin message, and
  treats "already signed in" as success. After login it returns to `?next=` (same-site paths only),
  so scanning the job QR on a logged-out phone ends up on the photos page after signing in.
- New `redirectIfSignedIn()` for the login page. `logout()` always ends on the login page.

### `js/labels.js`, `js/format.js`
- `labels.js`: maps for every enumeration in C.3, `CONDITION_FIELDS` (row order/labels), `label(code)`.
- `format.js`: `formatDateTime`, `formatDate` (year shown only when not the current year),
  `formatLongDate`, `todayInLagos`, `maskPhone`, plus `formatPhone` for the full number on the job page.
  All use `Africa/Lagos` and `en-NG`.
- Not applicable: there were no duplicated maps in `dashboard.js`/`job.js` (files were empty);
  `job.js` will use `err.status === 409` from the start (Phase 4).

### Tests run
- 24 assertions on `format.js`/`labels.js` (Lagos midnight boundary, invalid dates, phone formats).
- 17 scenarios on `auth.js` with Amplify stubbed and `fetch` mocked (200/201, 400, 404 empty body,
  409, 502 HTML body, network failure, 401, no token, login errors/challenge/redirects, logout offline).

## Phase 4 – Page integration (2026-10-23)

New shared module `js/layout.js`: `$`, `el()` (createElement + textContent only), `showError`,
`setBusy` (disables a button and swaps its label while a request runs), `initSidebar` (user name
from Cognito `name`/`given_name`/email, avatar initial, Log out). `auth.js` gained `displayName()`.
New dependency: `qrcode`.

| Page | Wired |
|---|---|
| Login | `redirectIfSignedIn()` on load; form → `login()`; errors in `#error`; button disabled while signing in; returns to `?next=` |
| Dashboard | `GET /jobs` → rows + four counts; chips and stat cards → `GET /jobs?status=X` (active one highlighted; clicking the active card returns to All); "Load more" with `cursor`; search → `GET /search?q=` with the "Type at least 2 characters" hint (no API call); clearing search restores All; rows link to `job.html?ticket=` (encoded); masked phone; Lagos dates; overdue = promised date before today and Under Repair/On Hold → red text + "· overdue"; "No jobs found"; loading and error rows; stale responses ignored when filters are clicked quickly |
| Intake | Live arrival time; `promisedDate.min = todayInLagos()`; Desktop → touchpad N/A; `POST /jobs` with codes, optional fields omitted when empty; `400` → server message in `#error`, all input kept; Register disabled while sending (one job per double-click); success → `location.replace("job.html?ticket=…&new=1")` |
| Job | `GET /jobs/{ticket}` fills every section; full phone as `tel:` link; history newest first in sentences with Lagos time and who; missing/unknown ticket → "Job not found" + dashboard link; Save → `PATCH` with `version` + changed fields only; re-render from the response; `409` → reload + "This job was updated by someone else. The latest version has been loaded."; `new=1` → "Device registered as ETC-XXXX. Write the ticket number on the device tag." (no notification wording), QR opened, `new=1` removed from the URL; QR (qrcode → canvas) to `${location.origin}/photos.html?ticket=…` |
| Photos | Loads job; shows ticket, status, device, customer · reported fault; upload button disabled "Photo upload coming soon"; Done → job page; unknown ticket → "Job not found." |

**QR codes and localhost:** the QR encodes `location.origin`, so during development it points at
`http://localhost:5173`, which a phone cannot open. It only works from a phone once the site is
hosted (Part E2), or in dev with `npx vite --host` and the PC's LAN address.

### Deviations from the plan
- **PATCH sends only changed fields** (plus `version`) instead of always all three, so the history
  only records real changes. "No changes to save." is shown without calling the API.
- **"Load more" appears for any status filter** that returns a `cursor`, not only Delivered.
- **History wording** depends on `activity[].type`, which C.3 does not list. `job.js` recognises
  types containing CREATE/REGISTER, STATUS, DIAGNOS, PROMISED and PHOTO, and falls back to the
  type name in words ("SOMETHING_ELSE" → "Something else"). **Check against the Lambda's real type
  names in Phase 6.**
- After registering, Back skips the filled-in intake form (`location.replace`) to avoid accidental
  duplicate registrations.
- Network failure during `POST /jobs` shows the connection message; the job may or may not have
  been created, so staff should check the dashboard before retrying.

### Mock end-to-end test (no AWS)
Chrome (Playwright) against the Vite dev server with Amplify replaced by a stub and the API by a
mock implementing C.3 (page size 2 to exercise Load more). Covers walkthrough tests 1–14 plus:
new-password challenge, already-signed-in redirect, required-field validation, desktop → N/A,
API 500, network failure, 401 mid-session. Result: **21/21 passed**, no unexpected console errors.
This verifies the frontend against the contract; it does not replace Phase 6 against the live API.

## Phase 5 – Hardening and clean-up (2026-10-23)

- `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval`, `new Function`: **none**
  in `site/js` or the pages. All API data goes in through `textContent`, `value` or attributes
  (`layout.js` `el()`), and the `<b>test</b>` check passes.
- No inline `style` attributes, inline scripts or `on…=` handlers in the pages (makes a strict
  Content-Security-Policy possible later).
- Console: no `console.log`. Two `console.error` calls remain: sign-out failure (logs the error
  name only) and QR drawing failure. No tokens, passwords or job objects are logged.
- Every `<button>` has an explicit `type`; every input/textarea has an associated `<label>`
  (checked in the browser on all five pages). "Other items received" now uses a visually hidden
  `<label>` instead of `aria-label`.
- Titles: "Staff login", "Dashboard", "New intake", "Job ETC-XXXX" (set after load), "Photos for
  ETC-XXXX" (set after load), each with "· ET Computers".
- Deleted (approved by the repo owner): `site/Saved.dc.html`, `site.zip` (also contained the real
  `.env`), `site/js/Saved.js`, `site/js/index.js` (both empty). Removed unused `.btn-ghost` CSS.
- `README.md` rewritten (was UTF-16 with only the title): prerequisites, `.env` setup with where
  each AWS value comes from, `npm install`, `dev`, `build`, `preview`.
- `npm audit`: 0 vulnerabilities.

## Phase 6 – Verification against the live API (to be filled in)

Needs: Part E1 done in AWS (incl. CORS for `http://localhost:5173` and `http://localhost:4173`),
a filled-in `site/.env`, and a staff login. Run with `npm run dev`, then again with
`npm run build && npm run preview`. Test jobs created here must be deleted before go-live (E2).

Tester: ________  Date: ________  Mode: dev / preview

| # | Test | Expected | Result (pass/fail + notes) |
|---|---|---|---|
| 1 | Open any page while logged out | Redirected to login | |
| 2 | Wrong password | "Incorrect email or password" | |
| 3 | Correct login | Dashboard shows real jobs and counts | |
| 4 | Each status filter, including Delivered + Load more | Correct jobs only | |
| 5 | Search: `etc-1`, a phone number in local format, part of a name, 1 character | Correct results; 1 character shows the hint, no API call | |
| 6 | Register a device with valid data | Lands on new job page with next ETC number; counts updated on dashboard | |
| 7 | Register with an invalid phone (`12345`) | Server message shown; form input kept | |
| 8 | Double-click Register | Only one job created | |
| 9 | Change status + promised date + diagnosis, Save | Values saved; three history entries | |
| 10 | Open the same job in two tabs, save in tab A, then save in tab B | Tab B shows the conflict message and reloads | |
| 11 | Unknown ticket `job.html?ticket=ETC-9999` | "Job not found" | |
| 12 | Name containing `<b>test</b>` | Shown as plain text, not bold | |
| 13 | Photos page at 390px width | Readable, no horizontal scroll | |
| 14 | Log out, press browser Back | Redirected to login | |

Also record:
- History wording after test 9: do the entries read as sentences, or as raw type names? Note the
  real `activity[].type` values (browser DevTools → Network → the `GET /jobs/…` response).
- Any CORS errors in the browser console (these point to API Gateway CORS settings, not the code).
