# Film Set

A mobile-first web app that replaces WhatsApp groups on film shoots. The direction team writes the
program sheet once; every department, actor and crew member gets only their own slice, and the
production office can see who has confirmed each version.

Built from the *Film Set App — Build Spec* (Phase 1).

## What's in Phase 1

- **Sign-up codes.** The office adds a person with a role; the app makes a one-time code (e.g. `LGT-4827`, 7 days). The code decides the person's film, role and channels. People never pick their own access.
- **Multiple films, one login.** Each film needs its own code, entered under *Your movies → Add another movie*. Login reopens the last film used.
- **Forgot password.** The office issues a reset code; entering it under *sign-up code* sets a new password and signs out other phones.
- **Program sheet → call sheets → confirmations.** Director / co-director / 1st AD edit a draft; only the director or co-director can send. Each send is a new version with a plain-language change list. Departments and actors get their own slice; only those whose slice changed are re-notified. Unaffected people keep their earlier confirmation. Tracker shows who hasn't tapped *Got it*, with call buttons and a reminder.
- **Notices for everyone**, with optional *Got it* for important ones.
- **On set now** live view for ADs and interns (auto-refreshes every 30 s).
- **Crew lists.** Started from the sent program sheet; add people on the day; mark absent; release early (0.5 / 1 / 1.5 / 2 call sheets, time, reason, recorded with who did it).
- **Approval.** Production team → Production Manager → Executive Producer. EP approval locks the day; only the EP can reopen, with a reason.
- **Producer records.** Crew lists, history search (call sheets per person), people & codes, change log.
- **Contracts & payments (producer only).** Per-day artists: approved call sheets × rate − paid. Packages: total − paid.
- **In-app notifications inbox** for every event above.
- **Name watermark** on sensitive screens unless the person's *Allow screenshots* switch is on.

## Security model

- All permissions live in [`src/lib/permissions.ts`](src/lib/permissions.ts) and mirror the spec's tables. Every page calls `requireCap(...)` and every server action calls `requireWrite(...)` before touching data. Unauthorised pages return 404, so they never load.
- Every query is filtered by the current film; a person's membership is re-checked (active, end date, film not wrapped) on every request.
- `audit_log` is append-only, enforced by a database trigger. Locked crew lists refuse changes at the database level.
- Wrapped films are read-only and only visible to the producer, EP and PM.

## Run it locally

Requires Node 20+ and Postgres 14+.

```bash
cp .env.example .env          # set DATABASE_URL
npm install
npm run db:migrate
npm run db:seed               # demo data (only runs on an empty database)
npm run dev                   # http://localhost:3000
```

Demo logins (password `Demo1234`): `owner`, `producer`, `ep`, `pm`, `office`, `director`, `codirector`,
`ad1`, `ad2`, `intern`, `lightshead`, `lights`, `arthead`, `camerahead`, `hero`, `mother`.

Codes to try: `SND-2345` (new sign-up as Sound crew), `LGT-4827` (log in as `lights`, then *Your movies → Add another movie*).

```bash
npm test                      # permission + program-sheet logic tests
npx tsc --noEmit && npm run lint
```

## Deploying

- **Database:** a managed Postgres in an India region (e.g. Supabase or Neon, Mumbai). Run `npm run db:migrate` against it. Don't run the seed in production.
- **App:** any Node host (e.g. Vercel). Set `DATABASE_URL`.
- Create the first company and owner with a one-off SQL insert or a small script (`people` row with a bcrypt hash, then `companies` with `owner_person_id`). The owner then creates films at `/owner`.

## Project layout

```
src/
  app/
    actions/        server actions (auth, schedule, crew, people, contracts, notices)
    app/            signed-in screens (home, schedule, crew, contracts, people, audit, inbox…)
    join/, login/, films/, owner/, welcome/
  components/       UI pieces (call sheet, program view, forms, watermark)
  db/               Drizzle schema, migrations runner, seed
  lib/              permissions, program-sheet logic, sessions, codes, queries
drizzle/            SQL migrations (incl. append-only audit trigger)
```

## Not built yet

Phase 1 left-overs: web push (notifications are in-app only), automatic reminder at a set time
(reminders are a button today; needs a scheduled job), printable call sheet PDF, department-head
equipment confirmation, wider laptop layout for the office.

Phase 2: photo of program sheet → crew list, actor dates grid and upload, schedule suggestions,
screenshot blocking via an Android wrapper.
