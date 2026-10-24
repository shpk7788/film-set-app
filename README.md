# Film Set — film.snyp.io

Call sheets, crew lists and updates for film shoots. The direction team writes the program sheet once;
every department, actor and crew member gets only their own slice, and the production office sees who
has confirmed. Built the same way as Palli: plain HTML/CSS/JavaScript (no build) on GitHub Pages, with
Supabase for logins and data.

## How access works
- Everyone joins with a **personal one-time code** (7 days) made by the production office. The code
  decides their film, role and channels. Each film needs its own code (**Your movies → Add another movie**).
- Every **channel** always exists. The **producer sees all of them** and decides who each is unlocked for:
  - **Menu → Channels & access:** switch channels on/off for everyone with a role.
  - **People → Manage → Channels for this person:** unlock or lock for one person.
  - Defaults come from the build spec (e.g. crew see only their own call sheet; 2nd AD sees today and tomorrow).
- Security is in the database (`supabase/schema.sql`): tables are closed to the public API and the website can
  only call database functions, each of which checks the caller's channels first. The publishable key in
  `config.js` is meant to be public.
- Locked crew lists and the change log can't be edited, even directly in the database.

## Setup (once)
1. **Supabase:** new project (region **South Asia (Mumbai)**). Leave the Data API **on**.
2. **SQL Editor → New query:** paste all of `supabase/schema.sql` → **Run**. Then run, with your own code:
   `insert into setup_secret values ('YOUR-SETUP-CODE');`
3. **Authentication → Sign In / Providers → Email:** turn **off** *Confirm email*.
4. Put the project URL and publishable key in `config.js`.
5. **GitHub → Settings → Pages:** deploy from branch `main`, folder `/ (root)`. Custom domain `film.snyp.io`.
6. **DNS (Hostinger):** `CNAME` record, name `film`, target `shpk7788.github.io`.
7. Open `https://film.snyp.io/#/setup`, enter the setup code, create your company and owner login, then your first film.

Updating the rules later: paste the new `supabase/schema.sql` and run it again (it's safe to re-run; data is kept).

Tip: many crew signing up from the same set Wi-Fi can hit Supabase's sign-up rate limit.
Raise it under **Authentication → Rate Limits** before a big sign-up day.

## Tests
```
cd tests && npm install
./reset-db.sh fs2                                                 # local Postgres with a Supabase stand-in
DATABASE_URL=postgres://...fs2 node --test db.test.mjs            # every rule, as each role (14 tests)
DATABASE_URL=postgres://...fs3 PORT=4000 node mock-supabase.mjs & # stand-in API + web server
BASE=http://localhost:4000 node browser.e2e.mjs                   # full run in a phone-sized browser
```

## Files
```
index.html, config.js, css/, js/        the website
js/api.js                               login + calling database functions (plain fetch)
js/views/                               screens
supabase/schema.sql                     tables, channel rules, every action (paste into Supabase)
tests/                                  database rule tests, browser test, local Supabase stand-in
```
The previous Next.js version is kept on the `nextjs-version` branch.
