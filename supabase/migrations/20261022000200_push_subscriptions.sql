-- QuickSync: Web Push subscriptions.
--
-- One row per device (browser push subscription) that wants a notification when a
-- message arrives from another device.
--
-- Security model
--   * The endpoint is a capability URL issued by the browser's push service (FCM, Apple,
--     Mozilla, Windows). Only the browser that owns a subscription knows it.
--   * p256dh and auth are the device's public encryption keys. Payloads are encrypted
--     end to end (RFC 8291), so the push service relays them without being able to read
--     them.
--   * Users can read and delete only their own rows. Rows are created through
--     register_push_subscription() so the owner always comes from the JWT.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),

  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_https
    check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  constraint push_subscriptions_keys_length
    check (char_length(p256dh) between 1 and 256 and char_length(auth) between 1 and 64)
);

comment on table public.push_subscriptions is 'Web Push subscriptions, one per device, used to notify about new messages.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Privileges and row level security
-- ---------------------------------------------------------------------------

revoke all on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;

create policy "Users can read their own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Registration
-- ---------------------------------------------------------------------------
-- An endpoint that is already registered (for example by another account that was
-- signed in on the same browser) moves to the caller instead of failing on the unique
-- constraint, so a shared device never keeps receiving the previous account's messages.
-- Endpoints are unguessable, so this cannot be used to take over someone else's device.

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  subscription_id uuid;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (caller, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        created_at = now()
  returning id into subscription_id;

  return subscription_id;
end;
$$;

comment on function public.register_push_subscription(text, text, text) is
  'Registers (or moves to the caller) a Web Push subscription for the signed-in user.';

revoke all on function public.register_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;
