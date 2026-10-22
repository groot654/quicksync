# QuickSync

**Copy anywhere. Access everywhere.**

QuickSync is a private, installable web app for moving text between your own devices.
Paste an SMS, OTP, link or note on one phone, tap **Send**, and it appears on your other
phone within about a second. Copy it there with one tap.

It is built for one owner (for example an Android phone and an iPhone signed in to the
same account), and the data model is already per-user, so more accounts can be added later
without changing the schema.

<p align="center">
  <img src="public/icons/icon-192.png" width="96" alt="QuickSync icon" />
</p>

---

## Contents

1. [Features](#features)
2. [Technology stack](#technology-stack)
3. [Architecture](#architecture)
4. [Security model](#security-model)
5. [Local setup](#local-setup)
6. [Environment variables](#environment-variables)
7. [Supabase configuration (production)](#supabase-configuration-production)
8. [Deploying to Vercel](#deploying-to-vercel)
9. [Installing the app on your phones](#installing-the-app-on-your-phones)
10. [Testing](#testing)
11. [Known browser limitations](#known-browser-limitations)
12. [Project structure](#project-structure)

---

## Features

| Feature          | Details                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Private sign-in  | Email and password through Supabase Auth. No public sign-up. Optional email allowlist. Sessions persist and are checked on the server for every page, action and query.                                                        |
| Send text        | Large composer that keeps line breaks and Unicode exactly as typed. Limit of 10,000 characters, validated in the browser, on the server and in the database. A **Paste** button, and Ctrl/Cmd+Enter to send.                   |
| Live sync        | Supabase Realtime (Postgres Changes on a private, RLS-authorised channel). The status badge shows the real channel state: **Connected**, **Connecting**, **Reconnecting** or **Offline**.                                      |
| Resilient sync   | Reconnects with exponential backoff, on returning online, and when the app returns to the foreground. After reconnecting it refetches and reconciles, without duplicates or deleted messages reappearing.                      |
| One-tap copy     | The newest message is featured with a large **Copy** button. OTP codes are detected so you can **Copy code** on its own. Falls back to `execCommand`, then to selecting the text for manual copying.                           |
| Notifications    | Web Push to your other devices, even when QuickSync is closed. One-time codes are shown in the notification title with **Copy code** and **Copy message** buttons. The sending device is never notified. Turned on per device. |
| Auto-copy codes  | Per-device setting (on by default). A code that arrives while QuickSync is open, or whose notification you tap, goes straight to the clipboard, so your keyboard offers it in the app asking for it.                           |
| History          | Newest first, relative and absolute timestamps, time remaining, delete with confirmation, **Clear all** with confirmation, and "Load older" pagination.                                                                        |
| Expiry           | Messages expire after 24 hours. Expired rows are hidden by RLS immediately and physically deleted every 15 minutes by `pg_cron`.                                                                                               |
| Duplicate-safe   | Each send carries a client-generated idempotency key, enforced by a unique constraint. Retries never create duplicates.                                                                                                        |
| Offline handling | Offline state, Send disabled, the draft kept in memory and never in storage, retry after failures, and a resync on reconnect.                                                                                                  |
| PWA              | Manifest, icons (including maskable), iOS home-screen metadata and launch images, a minimal service worker and an offline page.                                                                                                |
| Polish           | Light and dark mode, safe areas, keyboard resizing, 44px touch targets, reduced-motion support and accessible dialogs and status messages.                                                                                     |

## Technology stack

| Layer         | Choice                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router, Cache Components with Partial Prerendering, `proxy.ts`)                         |
| Language      | TypeScript (strict)                                                                                     |
| UI            | Tailwind CSS v4, shadcn/ui (Radix), Lucide icons, Sonner toasts, next-themes                            |
| Data and auth | Supabase Postgres, Supabase Auth (`@supabase/ssr`), Supabase Realtime                                   |
| Validation    | Zod (shared by client and server)                                                                       |
| Tests         | Vitest and Testing Library (unit), Vitest against local Supabase (integration), Playwright (end to end) |
| Hosting       | Vercel                                                                                                  |

React Hook Form was considered but not added: the app has two very small forms (one
textarea, plus email and password), and plain Zod validation with `useActionState` covers them
with less JavaScript.

## Architecture

```
Browser (Android / iPhone)                       Vercel (Next.js)                    Supabase
───────────────────────────                      ────────────────                    ────────
MessagesApp (client)                                                                   Postgres
 ├─ MessageComposer ── Server Action createMessage ──► verify JWT ─► insert ───────► messages (RLS)
 ├─ message list  ◄── useMessageSync ◄──────── Realtime (private channel, RLS) ◄── WAL
 │                     └─ refetch on reconnect/foreground ──── PostgREST (RLS) ───► select
 └─ delete / clear ── Server Actions deleteMessage / clearMessages ───────────────► delete (RLS)
                                                                                   pg_cron: purge expired
proxy.ts: refreshes the session cookie and redirects signed-out navigations

createMessage ── after() ──► notifyNewMessage ──► web-push (VAPID, encrypted) ──► FCM / Apple / Mozilla
                                                                                 └─► sw.js "push" ─► notification
                                                     "Copy code" tap ─► sw.js opens/focuses the app ─► app copies
```

- **Reads** (initial page render, refetches, pagination) go through
  `features/messages/queries.ts`. It works with both the server and the browser client;
  RLS limits every query to the caller's unexpired rows.
- **Writes** go through Server Actions in `features/messages/actions.ts`. Each one verifies
  the session (`getClaims()`), validates its input with Zod, sets `user_id` from the verified
  identity and returns a typed `ActionResult` with a safe message.
- **Realtime state** lives in one reducer (`features/messages/message-store.ts`), which
  de-duplicates by id, keeps a newest-first order, tracks recent deletions and reconciles
  refetches.
- **Notifications** live in `features/notifications`. Each device that turns them on
  stores its push subscription in `push_subscriptions`. After `createMessage` responds,
  `after()` sends an encrypted Web Push message to the user's other devices, and the
  service worker shows it. A service worker can't write to the clipboard, so **Copy
  code** opens or focuses QuickSync with only the message id, and the page copies the
  code (Android/Chromium allow this once the page has focus; Safari needs a tap, so a
  "Copy code" button appears instead).
- **Rendering:** `/` is a Partial Prerender. A static skeleton is served instantly, and
  the authenticated content streams in behind `<Suspense>` after `await connection()`, so
  private data is never prerendered or cached.

### Adding more users later

Everything is already scoped by `user_id` (table, RLS, Realtime topic, queries and
actions). To open the app to more people, create more accounts or enable sign-ups. If you
need shared spaces later, add a `spaces` table and a membership check to the RLS policies;
no client changes are required for basic multi-user use.

### Adding end-to-end encryption later

Message content is opaque to the server: it is only stored, filtered by owner and
returned. To add E2EE, encrypt in `MessageComposer` before calling `createMessage` and
decrypt in `MessageCard`, using a key derived on each device (for example a passphrase run
through PBKDF2 into AES-GCM with WebCrypto). Raise the database length limit to allow for
ciphertext. OTP detection would need to run after decryption, which it already does
because it runs in the browser.

## Security model

- **Authentication:** Supabase Auth, email and password. Public sign-up is disabled, so
  only accounts you create can sign in. `QUICKSYNC_ALLOWED_EMAILS` adds an optional second
  gate in the app.
- **Server-side checks:** the proxy refreshes sessions and redirects signed-out page
  navigations, but it is only a convenience. The page, every Server Action and every query
  verify the user again, and RLS enforces access in the database itself.
- **Row Level Security** on `public.messages`:
  - `SELECT` own rows only, and only while `expires_at > now()`.
  - `INSERT` only with `user_id = auth.uid()`. Column privileges allow clients to set only
    `user_id`, `client_id` and `content`; timestamps come from a trigger, so retention cannot be
    extended.
  - `DELETE` own rows only. There is no `UPDATE` privilege at all.
  - The `anon` role has no privileges on the table.
- **Realtime:** the app joins a private channel `quicksync:<user id>:…`. A policy on
  `realtime.messages` lets only that user join, and unauthenticated sockets are refused.
  Postgres Changes also applies the table's `SELECT` policy to every event.
- **Push notifications:**
  - Payloads are encrypted for the receiving device (RFC 8291), so Google, Apple or Mozilla
    relay them without being able to read them. They carry a preview of at most 240
    characters, and the detected code.
  - Notifications show that preview, including codes, on the lock screen. Turn
    notifications off on a device (⚙ menu), or hide notification content in the phone's
    settings, if that matters to you.
  - Subscriptions are readable and deletable only by their owner, and are created through
    `register_push_subscription()`, which takes the owner from the JWT.
  - The server only sends to known push-service hosts, so a stored endpoint can't be used
    to reach internal URLs.
  - Signing out removes the device's subscription first.
- **Secrets:** only the public URL, the publishable (anon) key and the public VAPID key
  reach the browser. The
  service-role key is optional, server-only, and used only by the user-creation script and
  the cleanup fallback.
- **Sensitive content:**
  - Message text is never logged. Errors log only an operation name and an error code,
    because Postgres error details can echo row values.
  - Message text is never put in URLs, analytics, `localStorage` or `sessionStorage`.
  - The service worker never caches pages, API responses or anything from Supabase.
  - Auth-cookie responses carry `Cache-Control: private, no-store`.
- **Security headers:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`,
  HSTS and a restrictive `Permissions-Policy`. Pages are marked `noindex`.

> **This is not end-to-end encryption.** TLS protects data in transit, and Supabase
> encrypts its disks at rest, but anyone with administrative access to your Supabase
> project (or Supabase itself) can technically read stored messages. Messages are deleted
> after 24 hours. See [Adding end-to-end encryption later](#adding-end-to-end-encryption-later).

## Local setup

**Prerequisites:** Node.js 20.9 or newer (developed on 24), npm, and Docker Desktop for the
local Supabase stack.

```bash
git clone <your-repo-url> quicksync && cd quicksync
npm install

# 1. Start Supabase locally. This applies the migrations in supabase/migrations.
npx supabase start -x storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

# 2. Create .env.local from the values printed by:
npx supabase status
cp .env.example .env.local
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
#   SUPABASE_SERVICE_ROLE_KEY=<SECRET_KEY>   (for user:create and the tests)

# 3. Create your account (the password is prompted for, with hidden input)
npm run user:create -- you@example.com

# 4. Run the app
npm run dev        # http://localhost:3000
```

Drop the `-x …` list if you want Supabase Studio and the other services locally.

**Trying it on your phones on the same Wi-Fi:** use the "Network" URL printed by
`npm run dev` (for example `http://192.168.0.10:3000`) and set `NEXT_PUBLIC_SUPABASE_URL`
to `http://<your-computer-ip>:54321`, so the phones can reach Supabase too. Over plain
HTTP the Clipboard API is unavailable, so QuickSync falls back to `execCommand`. Use the
deployed HTTPS site for real-world testing.

### Useful scripts

| Script                            | Purpose                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start` | Develop, build and serve                                                   |
| `npm run check`                   | Type check, lint and unit tests                                            |
| `npm run test`                    | Unit tests (no services needed)                                            |
| `npm run test:integration`        | Tests against local Supabase (RLS, constraints, expiry, cleanup, Realtime) |
| `npm run test:e2e`                | Playwright tests against `npm run start` and local Supabase                |
| `npm run format`                  | Prettier, including Tailwind class sorting                                 |
| `npm run icons`                   | Regenerate icons, favicon and iOS launch images                            |
| `npm run user:create -- email`    | Create an account, or reset its password                                   |
| `npm run push:keys`               | Generate the VAPID key pair for push notifications                         |
| `npm run db:types`                | Regenerate `src/types/database.ts` from the local database                 |

## Environment variables

See `.env.example`.

| Variable                               | Required | Exposed to browser | Purpose                                                                                                                  |
| -------------------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes      | Yes                | Supabase project URL                                                                                                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes      | Yes                | Publishable key (`sb_publishable_…`). The legacy anon key also works, either here or as `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `QUICKSYNC_ALLOWED_EMAILS`             | No       | No                 | Comma-separated allowlist. Empty means any existing account is allowed.                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`            | No       | **Never**          | Secret key, used only by `user:create` and `/api/cron/cleanup`                                                           |
| `CRON_SECRET`                          | No       | No                 | Bearer secret for the optional cleanup endpoint                                                                          |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`         | No       | Yes                | Web Push public key (`npm run push:keys`). Without all three VAPID values, notifications are simply not offered.         |
| `VAPID_PRIVATE_KEY`                    | No       | **Never**          | Web Push private key, from the same `npm run push:keys` run                                                              |
| `VAPID_SUBJECT`                        | No       | No                 | Contact for push services: `mailto:you@example.com` or your site's `https://` URL                                        |

Never prefix a secret with `NEXT_PUBLIC_`, and never commit `.env.local`.

## Supabase configuration (production)

1. **Create a project** at <https://supabase.com/dashboard>. The free plan is enough.

2. **Apply the migrations.** Either:
   - **CLI (recommended):**
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
   - **Dashboard:** open **SQL Editor** and run each file in `supabase/migrations/` in order.

   The migrations:
   - create `public.messages` with its constraints, indexes, timestamp trigger, privileges and RLS;
   - add the table to the `supabase_realtime` publication;
   - create `purge_expired_messages()`;
   - enable `pg_cron` and schedule the cleanup job every 15 minutes;
   - add the private-channel policy on `realtime.messages`;
   - create `public.push_subscriptions` (RLS) and `register_push_subscription()` for notifications.

3. **Authentication → Sign In / Providers:**
   - Turn **off** "Allow new users to sign up".
   - Keep the **Email** provider **enabled**. Disabling the provider disables
     email+password login itself, not only sign-ups.
   - "Confirm email" does not matter for accounts created through the script or the dashboard.

4. **Authentication → URL Configuration:** set **Site URL** to your production URL (for
   example `https://quicksync.vercel.app`), and add it plus `http://localhost:3000` to
   **Redirect URLs**. Password sign-in doesn't redirect, but Auth emails such as password
   resets use these values.

5. **Create your account:**
   - **Dashboard:** go to **Authentication → Users → Add user → Create new user**, enter the
     email and a strong password, and tick "Auto Confirm User".
   - **Or locally:** with the production URL and secret key in `.env.local`, run
     `npm run user:create -- you@example.com`.

6. **Realtime → Settings:** turn **off** "Allow public access", so that only private,
   RLS-authorised channels are accepted. QuickSync uses only private channels.

7. **Recommended:**
   - **Project Settings → JWT Keys:** migrate to asymmetric signing keys, so `getClaims()`
     verifies sessions locally instead of calling the Auth server.
   - **Authentication → Sessions:** optionally set an inactivity timeout.

8. **Check that cleanup is scheduled:** **Integrations → Cron** should list
   `quicksync-purge-expired-messages`. You can also run
   `select * from cron.job_run_details order by start_time desc limit 5;`.

### Cleanup: how expiry works and the fallback

- **Visibility:** the RLS policy hides any row with `expires_at <= now()` the moment it
  expires, from page loads, refetches, Realtime and direct API calls alike.
- **Deletion:** `pg_cron` runs `purge_expired_messages()` every 15 minutes inside the
  database. It needs no app traffic, no browser and no external service, and `pg_cron` is
  available on Supabase's free plan.
- **Fallback, if you cannot use `pg_cron`:** deploy with `SUPABASE_SERVICE_ROLE_KEY` and
  `CRON_SECRET` set, and add a `vercel.json`:

  ```json
  { "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 4 * * *" }] }
  ```

  Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. **Trade-off:** Vercel
  Hobby runs cron jobs at most once a day, so expired rows may physically remain for up
  to about a day. They stay invisible the whole time because of RLS. You also have to
  store the service-role key in Vercel.

## Deploying to Vercel

1. Push this repository to GitHub, GitLab or Bitbucket.
2. In Vercel, choose **Add New → Project**, import the repository and keep the defaults
   (Framework: Next.js, build `next build`).
3. Add the environment variables (Production, and Preview if wanted):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and optionally
   `QUICKSYNC_ALLOWED_EMAILS`. Add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` only if you use
   the cron fallback. For notifications, add `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (generate the keys once with
   `npm run push:keys`). The public key is built into the app, so redeploy after changing it.
4. Deploy, then set the Supabase **Site URL** and **Redirect URLs** to the deployed domain
   (step 4 above).
5. Open the site, sign in, and send yourself a message from a second device.

Before you deploy, `npm run build` should succeed locally. The build doesn't need a
database connection.

## Installing the app on your phones

**Android (Chrome)**

1. Open your QuickSync URL in Chrome and sign in.
2. Use the menu (⋮) → **Install app** (or **Add to Home screen**). Alternatively, the
   QuickSync settings menu (⚙) shows **Install app** when Chrome offers it.
3. Launch QuickSync from the home screen. It opens full-screen without browser UI.

**iPhone (Safari)**

1. Open your QuickSync URL in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open QuickSync from the home screen and **sign in again**. iOS keeps home-screen apps'
   cookies separate from Safari's.

**Turning on notifications (on each device)**

1. Open QuickSync (on iPhone, from the Home Screen icon; iOS 16.4 or newer).
2. Tap **Turn on notifications** on the card under the composer, or in the ⚙ menu, and
   allow notifications.
3. Send something from another device. One-time codes show as **Code 482 913** with
   **Copy code** and **Copy message** buttons (Android, desktop). On iPhone, tap the
   notification: with **Auto-copy codes** on, QuickSync opens with a **Copy code** button
   ready (iOS only allows copying after a tap).

## Testing

```bash
npm run check                 # type check, lint and 121 unit tests

npx supabase start            # then:
npm run test:integration      # 29 tests against the real local stack

npm run build
E2E_EMAIL=you@example.com E2E_PASSWORD='…' npm run test:e2e   # 6 browser tests
```

| Requirement                            | Where it is tested                                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and unauthorized access | `tests/unit/auth.test.ts` (sign-in, allowlist, proxy redirects), `tests/integration/messages-db.test.ts` (anon denied, sign-up refused), e2e (redirect, wrong password, sign-out)                                                                                           |
| Message creation                       | Unit (action), integration (exact round trip, 24h expiry), e2e                                                                                                                                                                                                              |
| Empty-message rejection                | Unit (schema, action, composer), integration (DB constraint)                                                                                                                                                                                                                |
| Length validation                      | Unit (10,000 and 10,001; emoji counted as one), integration (DB constraint)                                                                                                                                                                                                 |
| Deletion and Clear all                 | Unit (actions, reducer), integration, e2e (delete syncs across devices; clear all survives a reload)                                                                                                                                                                        |
| Ownership restrictions                 | Integration (spoofed `user_id`, cross-user read and delete, no updates, no client timestamps), unit (action scoping)                                                                                                                                                        |
| Expired-message filtering              | Integration (RLS hides expired rows, purge deletes them, users can't call the purge), unit (`filterActive`)                                                                                                                                                                 |
| Duplicate submissions                  | Unit (double tap sends once, retries reuse the idempotency key, an edit gets a new key, the action returns the original on a unique violation), integration (unique constraint)                                                                                             |
| Copy button                            | Unit (exact multiline copy, `execCommand` fallback, failure message), e2e (clipboard content, OTP copy)                                                                                                                                                                     |
| Notifications                          | Unit (payload, code formatting, endpoint allowlist, subscribe/unsubscribe actions, sending, pruning gone devices, sender excluded, one notification per message on retries, notification intents, auto-copy), integration (RLS, RPC owner, endpoint moves between accounts) |
| Realtime synchronization               | Unit (`useMessageSync`: status, de-duplication, deletes, reconnect with backoff, offline, foreground refetch, cleanup), integration (cross-device delivery, private-channel authorisation, no leaks), e2e (Android → iPhone)                                                |

The manual device checklist is in [docs/manual-testing.md](docs/manual-testing.md).

## Known browser limitations

- **No background sync on iOS.** Safari and home-screen apps suspend JavaScript and close
  sockets in the background. Messages appear live while QuickSync is open. When you return
  to it, it reconnects and refetches within a moment. Push notifications still arrive in
  the background.
- **Notifications.**
  - They need the production build (`npm run dev` doesn't register the service worker;
    use `npm run build && npm start` to try them locally) and HTTPS (or `localhost`).
  - iPhone and iPad: iOS 16.4+ and only in the Home Screen app, not in Safari tabs. iOS
    shows no action buttons, so tapping the notification opens QuickSync, which offers
    **Copy code**.
  - A web app can't copy from inside a notification or type into another app. **Copy
    code** opens QuickSync for a moment and copies there; the keyboard's clipboard
    suggestion (Gboard, iOS "Paste") then fills it in. Real SMS autofill ("From Messages")
    only works for texts received by that phone itself.
  - While QuickSync is open and focused, no notification is shown: the message appears
    live instead.
- **Clipboard rules.**
  - Copying must start from a tap, which QuickSync respects.
  - Reading the clipboard (**Paste**) shows a system "Paste" prompt on iOS and asks for
    permission on Android.
  - Firefox can't read the clipboard from web pages, so the Paste button is hidden there.
    Long-press to paste instead.
- **Plain HTTP (LAN testing):** the Clipboard API and `crypto.randomUUID` need HTTPS.
  QuickSync falls back automatically, but test real devices on the HTTPS deployment.
- **iOS home-screen apps have their own session**, separate from Safari, so you sign in
  once inside the installed app.
- **Theme colour** in the browser chrome follows the system light/dark setting, even if
  you switch QuickSync's theme by hand.
- **Offline:** you can't send while offline, and history isn't stored on the device (by
  design, for privacy). The draft stays on screen but is lost if the page is closed.

## Project structure

```
src/
  app/
    (app)/page.tsx            Protected home: static skeleton + streamed authenticated app
    (app)/error.tsx           Error boundary
    login/page.tsx            Sign-in page (static)
    api/cron/cleanup/route.ts Optional cleanup fallback (secret-protected)
    layout.tsx                Fonts, theme, toasts, PWA metadata, viewport
    manifest.ts               Web app manifest
    globals.css               Design tokens (light/dark), safe-area utilities
  proxy.ts                    Session refresh + optimistic redirects
  components/                 App-wide components (header, logo, theme, confirm dialog)
  components/ui/              shadcn/ui primitives (only the ones used)
  features/
    auth/                     Server actions, DAL (getAuthContext), schemas, login form, account menu
    messages/                 Server actions, queries, schemas, reducer, sync hook, UI components
    notifications/            Web Push subscribe/send, payload, notification intents, auto-copy
  hooks/                      Online status, ticking clock, install prompt
  lib/                        Env, Supabase clients, clipboard, ids, OTP detection, time formatting
  types/database.ts           Generated Supabase types
supabase/
  config.toml                 Local stack config (sign-ups disabled)
  migrations/                 Schema, RLS, Realtime, cleanup
public/
  sw.js, offline.html, icons/ Service worker, offline page, icons and iOS launch images
scripts/                      Icon generator, user provisioning
tests/
  unit/                       Vitest (jsdom/node)
  integration/                Vitest against local Supabase
  e2e/                        Playwright
docs/manual-testing.md        Device test checklist
```
