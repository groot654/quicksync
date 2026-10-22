-- QuickSync: private Realtime channels.
--
-- The app subscribes to Postgres Changes on a *private* channel whose topic starts with
-- "quicksync:<user id>:". Joining a private channel requires a SELECT policy on
-- realtime.messages, so only the signed-in owner can join their own topic, and
-- anonymous sockets cannot join at all. With "Allow public access" disabled in the
-- project's Realtime settings, public (unauthorised) channels are refused entirely.

create policy "QuickSync users can join their own sync channel"
  on realtime.messages
  for select
  to authenticated
  using (starts_with((select realtime.topic()), 'quicksync:' || (select auth.uid())::text || ':'));
