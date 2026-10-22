// Creates (or resets the password of) an authorized QuickSync account.
//
// Sign-ups are disabled, so this script, or "Add user" in the Supabase dashboard, is
// the only way to create an account. It needs the service role key and is meant to be
// run by the owner on a trusted machine.
//
// Usage:
//   npm run user:create -- you@example.com
// The password is read from the QUICKSYNC_PASSWORD environment variable, or prompted
// for (input hidden) so it never ends up in shell history.
import { createInterface } from "node:readline";

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !email.includes("@")) {
  console.error("Usage: npm run user:create -- you@example.com");
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (e.g. in .env.local).",
  );
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password =
  process.env.QUICKSYNC_PASSWORD ?? (await promptHidden("Password (min. 10 characters): "));
if (!password || password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (!error) {
  console.log(`Created ${created.user.email}. You can now sign in to QuickSync.`);
  process.exit(0);
}

if (error.code !== "email_exists") {
  console.error(`Could not create the user: ${error.message}`);
  process.exit(1);
}

// The account exists: update its password instead.
let page = 1;
for (;;) {
  const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (listError) {
    console.error(`Could not look up the user: ${listError.message}`);
    process.exit(1);
  }
  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (user) {
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
    if (updateError) {
      console.error(`Could not update the password: ${updateError.message}`);
      process.exit(1);
    }
    console.log(`Updated the password for ${email}.`);
    process.exit(0);
  }
  if (data.users.length < 200) break;
  page += 1;
}

console.error("The user exists but could not be found to update.");
process.exit(1);
