# ENTREPRENEURSHIP DEVELOPMENT PROGRAM portal (edp.sumago.ai)

Student registration portal of the EDP by Sumago Infotech Pvt. Ltd., plus its tracking panel. It talks only to the
`/api/v1/edp` endpoints of **amrut-kalash-api** (module `src/modules/students/edp`); it never calls the Amrut admin API.

| Path | Who | What |
| --- | --- | --- |
| `/register` | Student | Create account (first / middle / last name, email, mobile, password ×2). An OTP is emailed. |
| `/verify` | Student | Enter the OTP (valid 5 minutes). Wrong code → "Incorrect OTP"; after 5 minutes → "OTP has expired". **Resend OTP** is offered once the OTP has expired and sends a new one, which replaces it. The countdowns follow the server (also after a reload or a login). The password chosen at sign-up goes with the OTP (kept in memory from the sign-up or login; asked for after a reload), so a sign-up made by someone else with the student's email cannot take the account over. |
| `/login` | Student | Email + password, and **Forgot password?** |
| `/forgot-password` | Student | Emails a link to set a new password (valid 30 minutes, usable once) to a registered email ID; any other gets "This email ID is not registered. Kindly check your email ID." |
| `/reset-password?token=…` | Student | The emailed link: new password ×2, then back to the login. Every other session of the account is signed out. |
| `/application` | Student | Step 1 of 3 – Basic Details, Step 2 of 3 – Main Form, Step 3 of 3 – Upload Documents. Saved as typed, so the student resumes where they stopped. After submission (final: no edit or resubmission): the submitted registration, read-only. |
| `/manage/login`, `/manage` | EDP team | Tracking panel: every account with its stage (OTP pending, verified, step 1, step 2, submitted), with follow-ups (status + note) per student; `/manage/applicants/:id` shows one student's full form and documents. |

A submitted form stays in the EDP system (registration ID `EDP-000001`, …); the EDP team sees it in the tracking
panel (`/manage`, View on a student). Dropdowns list only active master values. After submitting, the student sees whom to
contact with a query (email ID and mobile number from the API settings below).

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
- `EDP_SUPPORT_EMAIL`, `EDP_SUPPORT_MOBILE`: the contact shown after submitting; change them and restart the API (no
  portal build needed).
- `EDP_PORTAL_URL`: the portal address used in the password reset link (default `https://edp.sumago.ai` in production,
  `http://localhost:5175` otherwise).
- `EDP_ADMIN_EMAIL`, `EDP_ADMIN_PASSWORD`: tracking-panel sign-in created by `npm run seed` (production).
- Add `https://edp.sumago.ai` to `FRONTEND_URL` when the portal calls the API on another origin.

## Build

```bash
npm run build      # dist/, a static single-page app: serve index.html for every path (/application, /manage, …)
npm test
```
