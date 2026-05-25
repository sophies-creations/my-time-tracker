# TimeTrack

A full-stack time tracking app (Clockify-style) built with React + Vite, Supabase, and Tailwind CSS.

## Features

- **Timer** — start/stop with project & description; manual time entry with tag labels
- **Daily log** — entries grouped by date, inline edit & delete
- **Projects** — colour-coded; managers can create, edit, archive
- **Reports** — date range presets (Today / Week / Month / Custom), filter by project & user, Excel export
- **Team** — Admin manages roles; invite system generates shareable links
- **Roles** — Admin (full access), Manager (team entries + project management), Member (own entries only)

---

## Deploy in 4 steps

### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (free tier is fine).
2. Click **New project**, choose a name, set a strong database password, pick a region close to you.
3. Wait for provisioning (~1 min).

### Step 2 — Run the database schema

1. In the Supabase dashboard, open the **SQL Editor** (left sidebar).
2. Click **New query**, paste the entire contents of `supabase/schema.sql`, then click **Run**.
3. You should see "Success. No rows returned." for each statement.

### Step 3 — Enable Email auth

1. Go to **Authentication → Providers** in the Supabase dashboard.
2. Make sure **Email** is enabled (it is by default).
3. (Optional) Under **Authentication → Email Templates** you can customise the confirmation email.

### Step 4 — Deploy to Vercel

1. Push this repo to GitHub (or GitLab / Bitbucket).
2. Go to [vercel.com](https://vercel.com), create a new project, import your repo.
3. In the **Environment Variables** section add:
   | Key | Value |
   |-----|-------|
   | `VITE_SUPABASE_URL` | Your Supabase project URL (`https://xxxx.supabase.co`) |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase `anon` public key |
   
   Find both values in Supabase → **Project Settings → API**.
4. Click **Deploy**. Vercel auto-detects Vite and uses `npm run build` + `dist/` output.

---

## Local development

```bash
# 1. Clone and install
git clone <your-repo>
cd my-time-tracker
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start dev server
npm run dev
```

---

## First-time setup after deploy

After signing up for the very first time, you need to promote yourself to Admin manually:

1. Open the Supabase **SQL Editor**.
2. Run:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
   ```
3. Refresh the app — you now have full access including the **Team** page.

From the Team page you can invite others and set their roles without touching SQL.

---

## Role permissions

| Feature | Member | Manager | Admin |
|---------|--------|---------|-------|
| Track own time | ✓ | ✓ | ✓ |
| View own entries & reports | ✓ | ✓ | ✓ |
| View **all** team entries & reports | — | ✓ | ✓ |
| Create / edit / archive projects | — | ✓ | ✓ |
| Export Excel | ✓ (own) | ✓ (all) | ✓ (all) |
| Invite users & manage roles | — | — | ✓ |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| Backend / DB | Supabase (Auth + Postgres + RLS) |
| Excel export | SheetJS (xlsx) |
| Date utilities | date-fns |
| Icons | lucide-react |
| Toasts | react-hot-toast |

---

## Project structure

```
src/
  lib/supabase.js          — Supabase client
  contexts/AuthContext.jsx — Auth state + role helpers
  pages/
    Login.jsx              — Sign in / sign up
    Tracker.jsx            — Main time tracking page
    Projects.jsx           — Project list
    Reports.jsx            — Reports + Excel export
    Team.jsx               — User management (admin)
    AcceptInvite.jsx       — Invite acceptance landing page
  components/
    Layout.jsx             — App shell
    Sidebar.jsx            — Navigation sidebar
    TimerWidget.jsx        — Live timer bar (top of page)
    TimeEntryList.jsx      — Grouped entry list
    ManualEntryModal.jsx   — Add / edit time entry
    ProjectModal.jsx       — Create / edit project
    InviteModal.jsx        — Generate invite link
    ProtectedRoute.jsx     — Auth guard
  utils/
    formatters.js          — Duration / date helpers
    export.js              — Excel export
supabase/
  schema.sql               — Full DB schema + RLS policies
```
