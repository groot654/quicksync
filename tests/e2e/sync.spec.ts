import { devices, expect, test, type Browser, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "dev@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.skip(!PASSWORD, "Set E2E_PASSWORD (and optionally E2E_EMAIL) to run end-to-end tests.");

async function openDevice(browser: Browser, device: keyof typeof devices) {
  const context = await browser.newContext({
    ...devices[device],
    // Chromium stands in for each phone's browser; the clipboard needs permission here.
    permissions: ["clipboard-read", "clipboard-write"],
  });
  return context.newPage();
}

/** The Windows OS clipboard stores line breaks as CRLF; the app copies exactly what was sent. */
async function readClipboard(page: Page) {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return process.platform === "win32" ? text.replace(/\r\n/g, "\n") : text;
}

async function signIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("status").filter({ hasText: "Connected" })).toBeVisible({
    timeout: 20_000,
  });
}

test("unauthenticated visitors are sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "QuickSync" })).toBeVisible();
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Incorrect email or password." }),
  ).toBeVisible();
});

test("text sent on Android appears on the iPhone instantly and copies with one tap", async ({
  browser,
}) => {
  const android = await openDevice(browser, "Pixel 7");
  const iphone = await openDevice(browser, "iPhone 12");
  await signIn(android);
  await signIn(iphone);

  const sms = `Your verification code is 482913.\nDo not share it. ✅ ${Date.now()}`;

  // Android: paste and send.
  await android.getByRole("textbox", { name: "Message" }).fill(sms);
  await android.getByRole("button", { name: "Send" }).click();
  await expect(android.getByRole("textbox", { name: "Message" })).toHaveValue("");

  // iPhone: the message appears without a refresh, as the featured latest message.
  const latest = iphone.locator("article").first();
  await expect(latest).toContainText("Your verification code is 482913.", { timeout: 10_000 });
  await expect(latest.getByText("Latest")).toBeVisible();
  await expect(iphone.getByText(sms.split("\n")[1])).toBeVisible();

  // One tap copies the exact text, including the line break.
  await latest.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(latest.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await readClipboard(iphone)).toBe(sms);

  // The detected OTP can be copied on its own.
  await latest.getByRole("button", { name: /Copy code 482913/ }).click();
  expect(await readClipboard(iphone)).toBe("482913");

  // Deleting on the iPhone removes it from Android too.
  await latest.getByRole("button", { name: "Delete message" }).click();
  await iphone.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(android.getByText(sms.split("\n")[1])).toHaveCount(0, { timeout: 10_000 });

  await android.context().close();
  await iphone.context().close();
});

test("going offline shows the state, keeps the draft and recovers on reconnect", async ({
  browser,
}) => {
  const phone = await openDevice(browser, "iPhone 12");
  await signIn(phone);

  const box = phone.getByRole("textbox", { name: "Message" });
  await box.fill("draft written while offline");

  await phone.context().setOffline(true);
  await expect(phone.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Offline" })).toBeDisabled();
  await expect(box).toHaveValue("draft written while offline");

  await phone.context().setOffline(false);
  await expect(phone.getByRole("status").filter({ hasText: "Connected" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(phone.getByRole("button", { name: "Send" })).toBeEnabled();

  await phone.context().close();
});

test("clear all removes every message after confirmation", async ({ browser }) => {
  const phone = await openDevice(browser, "Pixel 7");
  await signIn(phone);

  for (const text of ["first note", "second note"]) {
    await phone.getByRole("textbox", { name: "Message" }).fill(text);
    await phone.getByRole("button", { name: "Send" }).click();
    await expect(phone.getByRole("textbox", { name: "Message" })).toHaveValue("");
  }

  await phone.getByRole("button", { name: "Clear all" }).click();
  await phone.getByRole("alertdialog").getByRole("button", { name: "Clear all" }).click();
  await expect(phone.getByText("Nothing synced yet")).toBeVisible();

  // Survives a refresh: the data is really gone.
  await phone.reload();
  await expect(phone.getByText("Nothing synced yet")).toBeVisible();

  await phone.context().close();
});

test("signing out ends the session", async ({ browser }) => {
  const phone = await openDevice(browser, "Pixel 7");
  await signIn(phone);

  await phone.getByRole("button", { name: "Account and settings" }).click();
  await phone.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(phone).toHaveURL(/\/login$/);

  await phone.goto("/");
  await expect(phone).toHaveURL(/\/login$/);

  await phone.context().close();
});
