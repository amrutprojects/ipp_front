# 3 Month Internship Placement Program portal (ipp.sumago.ai)

Student registration portal of the program by Sumago Infotech Pvt. Ltd., plus its tracking panel. It talks only to the
`/api/v1/edp` endpoints of **amrut-kalash-api** (module `src/modules/students/edp`); it never calls the Amrut admin API.

| Path | Who | What |
| --- | --- | --- |
| `/register` | Student | Create account (first / middle / last name, email, mobile, password ×2). An OTP is emailed. |
| `/verify` | Student | Enter the OTP (valid 5 minutes). Wrong code → "Incorrect OTP"; after 5 minutes → "OTP has expired". **Resend OTP** is offered once the OTP has expired and sends a new one, which replaces it. The countdowns follow the server (also after a reload or a login). The password chosen at sign-up goes with the OTP (kept in memory from the sign-up or login; asked for after a reload), so a sign-up made by someone else with the student's email cannot take the account over. |
| `/login` | Student | Email + password, and **Forgot password?** |
| `/forgot-password` | Student | Emails a link to set a new password (valid 30 minutes, usable once) to a registered email ID; any other gets "This email ID is not registered. Kindly check your email ID." |
| `/reset-password?token=…` | Student | The emailed link: new password ×2, then back to the login. Every other session of the account is signed out. |
| `/application` | Student | Step 1 of 3 – Basic Details, Step 2 of 3 – Main Form, Step 3 of 3 – Upload Documents. Fields, labels (Marathi / English), choices and documents come from the masters (`GET /edp/options`). Saved as typed, so the student resumes where they stopped. After submission (final: no edit or resubmission): the submitted registration, read-only. |
| `/manage/login`, `/manage` | Program team (Auditor) | Tracking panel: every account with its stage (OTP pending, verified, step 1, step 2, submitted) and approval stage, filtered by name, district, category, stage of application, documents, mobile number, centre and final verification, with follow-ups (status + note) per student. The Auditor verifies each uploaded document and approves the form, which then waits for a batch. `/manage/applicants/:id` shows one student's full form, documents (verified there), approval history and changes; `/manage/applicants/:id/edit` changes the form until the final approval. |
| `/manage/batches` | Program team (Auditor) | Batches: exactly the batch size (`/manage/settings`) of approved students of one district, created from the list. A new batch goes to the Divisional Officer of that district (admin panel) and through the later approvals; a rejected student goes back one stage and stays in the batch. |
| `/manage/masters` | Program team (Auditor) | Masters: dropdown lists, technologies (and which of them each district offers), documents, form fields (names in both languages, required, on / off, order, own fields), districts and the Center Master (`/manage/centres`). An admin changes them, a viewer sees them; they apply to every login. |
| `/manage/settings` | Program team | The **batch size**, and what the portal says, edited without a release: the **support contact** line shown after a submission, the **welcome message** (the congratulations popup) and the **Help button** (a heading and up to four name / value lines). An admin saves them, a viewer reads them. |

A submitted form stays in the program's records (registration ID `IPP-000001`, …); the program team sees it in the tracking
panel (`/manage`, View on a student). Dropdowns list only active master values. After submitting, the student sees whom to
contact with a query (email ID and mobile number from the API settings below).

Students are congratulated as soon as the OTP is verified and the account exists, and every student screen has a **Help**
button in its bottom-right corner. Both are written on `/manage/settings` (sent to the portal with `GET /edp/options`), so
the wording and the contact details change without a build; until an admin saves them the portal uses its own text and
`EDP_SUPPORT_EMAIL` / `EDP_SUPPORT_MOBILE`.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5175, /api proxied to http://localhost:5001
```

API side (amrut-kalash-api): `npm run migration:run`, then `npm run edp:admin` to create a tracking-panel sign-in
(credentials written to `.edp-admin-credentials`, git-ignored). Without SMTP settings the OTP is written to the API log
(development only).

## Configuration

Frontend (`.env`, see `.env.example`): `VITE_API_BASE_URL` (default `/api/v1`), `VITE_API_PROXY_TARGET` (dev server only).

API (`.env` of amrut-kalash-api, see its `.env.example`):

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: the OTP and password reset emails. Gmail:
  `smtp.gmail.com`, `465`, `SMTP_SECURE=true`, an app password.
- `EDP_OTP_TTL_SECONDS` (default 300 = 5 minutes), `EDP_OTP_RESEND_SECONDS` (default: the OTP lifetime, i.e. a new OTP
  once the current one has expired), `EDP_RATE_LIMIT_MAX`, `EDP_SESSION_HOURS`, optional `EDP_JWT_SECRET`.
- `EDP_SUPPORT_EMAIL`, `EDP_SUPPORT_MOBILE`: the contact shown after submitting and in the Help button, until an admin
  sets them on `/manage/settings`; change them and restart the API (no portal build needed).
- `EDP_PORTAL_URL`: the portal address used in the password reset link (set it to `https://ipp.sumago.ai` in production;
  `http://localhost:5175` by default in development).
- `EDP_ADMIN_EMAIL`, `EDP_ADMIN_PASSWORD`: tracking-panel sign-in created by `npm run seed` (production).
- Add `https://ipp.sumago.ai` to `FRONTEND_URL` when the portal calls the API on another origin.

## Build

```bash
npm run build      # dist/, a static single-page app: serve index.html for every path (/application, /manage, …)
npm test
```
