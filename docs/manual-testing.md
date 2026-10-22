# Manual test checklist

Run this on the deployed HTTPS site with your real Android phone and iPhone. Tick each
item, and note the device, OS and browser version for anything that fails.

**Setup:** one account; Android signed in with Chrome; iPhone signed in with Safari and
with the installed home-screen app.

## 1. Android Chrome

- [ ] Visiting `/` while signed out redirects to the login page.
- [ ] A wrong password shows "Incorrect email or password." and keeps the email filled in.
- [ ] Signing in lands on the main screen, and the badge turns **Connected** within a couple of seconds.
- [ ] Copy an SMS in Messages, tap **Paste** (allow clipboard access), then **Send**. The box clears and "Sent to your devices" appears.
- [ ] Long-press paste into the box also works.
- [ ] A multiline SMS keeps its line breaks after sending.
- [ ] Double-tapping **Send** quickly creates only one message.
- [ ] When the keyboard opens, the Send button stays visible and the page doesn't scroll sideways.
- [ ] **Copy** on a message, pasted into another app, gives the exact text.
- [ ] Delete → confirm removes the message. **Clear all** → confirm empties the list.
- [ ] Menu (⚙) → **Install app** installs it; the installed app opens without browser UI.

## 2. iPhone Safari

- [ ] Sign in works, and the badge shows **Connected**.
- [ ] A message sent from Android appears **without refreshing** within about 1–2 seconds, as the **Latest** card.
- [ ] One tap on **Copy** copies it; pasting into Notes or Messages gives the exact text, including line breaks.
- [ ] For an OTP SMS, **Copy code 123456** copies just the digits.
- [ ] Focusing the text box doesn't zoom the page.
- [ ] Nothing hides under the notch or the home indicator.
- [ ] Dark mode (Settings → Display) looks correct, and the toggle in the app works.
- [ ] Phone numbers and codes in messages are not turned into blue links.

## 3. iPhone home-screen app (PWA)

- [ ] Share → **Add to Home Screen** shows the QuickSync icon and name.
- [ ] Launching shows the indigo launch screen, then the app full screen.
- [ ] Sign in inside the app (it has a separate session from Safari).
- [ ] Live sync and one-tap copy work as in Safari.
- [ ] Switch to another app for at least 30 seconds, send from Android, then return: the badge briefly shows "Reconnecting" and the new message appears.
- [ ] Force-quit and reopen: you are still signed in, and the history loads.

## 4. Different networks

- [ ] Android on mobile data, with the iPhone on Wi-Fi: messages sync both ways.
- [ ] Android acting as a hotspot with the iPhone connected to it: messages sync both ways.
- [ ] Both phones on different Wi-Fi networks: messages sync both ways.

## 5. Disconnection and reconnection

- [ ] Airplane mode on the iPhone shows **Offline**, and Send turns into a disabled "Offline" button.
- [ ] Text typed while offline stays in the box.
- [ ] Turning airplane mode off returns the badge to **Connected**, and the draft can now be sent.
- [ ] A message sent from Android while the iPhone was offline appears when the iPhone reconnects, with no duplicate.
- [ ] Delete a message on Android while the iPhone is offline: after reconnecting, it is gone on the iPhone too.
- [ ] Airplane mode **during** sending shows an error with **Retry**; tapping Retry once back online results in exactly one message.
- [ ] Opening the installed app with no connection shows the "You're offline" page, and it recovers automatically when the connection returns.

## 6. Refresh and navigation

- [ ] Pull-to-refresh or reload keeps you signed in and shows the same history.
- [ ] After reloading, both devices still show **Connected** and keep syncing.

## 7. Sessions

- [ ] **Sign out** (⚙ → Sign out) returns to the login page; the back button does not show your messages.
- [ ] After signing out, visiting `/` redirects to login.
- [ ] Signing out on one phone keeps the other phone signed in.
- [ ] Session expiry: in Supabase **Authentication → Users**, delete the user's sessions (or temporarily delete and re-create the user). Once the current access token expires (up to the JWT expiry, 1 hour by default), reloading or sending returns the app to the login page instead of failing silently. To test quickly, set **JWT expiry** to 60 seconds on a test project.

## 8. Expiry

- [ ] New messages show "24h left".
- [ ] In the SQL editor, run `update messages set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where id = '<id>';`. The message disappears after a reload or reconnect.
- [ ] Within 15 minutes, `select count(*) from messages where expires_at <= now();` returns 0 (pg_cron cleanup ran).

## 9. Security spot checks

- [ ] Signing up through the API (`supabase.auth.signUp`) is refused.
- [ ] The Network tab shows no message text in any URL.
- [ ] DevTools → Application: Local Storage and Session Storage contain no message text, and Cache Storage contains only `/_next/static`, icons and `offline.html`.
- [ ] Local Storage holds only `quicksync:auto-copy-codes` and `quicksync:notification-prompt-dismissed` flags. A notification-opened URL contains only `notification=<action>&message=<id>`, and the app removes it right away.

## 10. Notifications

Needs the deployed HTTPS site with the three VAPID variables set.

- [ ] Android (installed app): tap **Turn on notifications**, allow. The card disappears and the ⚙ menu shows **Turn off notifications**.
- [ ] iPhone in Safari (not installed): the card asks to add QuickSync to the Home Screen. From the Home Screen app, turning on works.
- [ ] With QuickSync closed on Android, send "Your verification code is 482913" from the iPhone. The notification title is **Code 482 913** with **Copy code** and **Copy message** buttons.
- [ ] **Copy code** opens QuickSync and shows "Code 482913 copied"; pasting anywhere gives `482913`. Gboard offers it as a clipboard suggestion.
- [ ] **Copy message** copies the full text.
- [ ] Sending a plain link gives a "New message" notification with one **Copy** button.
- [ ] The sending phone gets no notification for its own message.
- [ ] With QuickSync open and in front on the receiving phone, no notification appears; the message arrives live, and with **Auto-copy codes** on, its code is copied ("Code … copied").
- [ ] iPhone (Home Screen app, closed): send a code from Android. Tap the notification: QuickSync opens with a **Copy code** button in a toast, and tapping it copies the code.
- [ ] Turning **Auto-copy codes** off: tapping a code notification only opens the app; the **Copy code** action still copies.
- [ ] Opening QuickSync clears its notifications that are still showing.
- [ ] **Turn off notifications** on one phone: it gets no further notifications, the other phone still does.
- [ ] Sign out on a phone: it gets no further notifications for that account.
