// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks -------------------------------------------------------------------------------

const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getClaims: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth }),
}));

class RedirectError extends Error {
  constructor(public readonly location: string) {
    super(`NEXT_REDIRECT:${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectError(location);
  },
}));

const { signIn } = await import("@/features/auth/actions");
const { updateSession } = await import("@/lib/supabase/proxy");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("QUICKSYNC_ALLOWED_EMAILS", "");
  Object.values(auth).forEach((fn) => fn.mockReset());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// --- Sign in -------------------------------------------------------------------------------

describe("signIn action", () => {
  it("returns field errors for invalid input without calling Supabase", async () => {
    const state = await signIn({}, form({ email: "not-an-email", password: "" }));
    expect(state.fieldErrors?.email).toBeTruthy();
    expect(state.fieldErrors?.password).toBeTruthy();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("uses one generic message for wrong credentials", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: "invalid_credentials" },
    });
    const state = await signIn({}, form({ email: "me@example.com", password: "wrong" }));
    expect(state.error).toBe("Incorrect email or password.");
    expect(state.email).toBe("me@example.com");
  });

  it("redirects to the app after a successful sign-in", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { email: "me@example.com" } },
      error: null,
    });
    await expect(
      signIn({}, form({ email: "me@example.com", password: "right" })),
    ).rejects.toMatchObject({ location: "/" });
  });

  it("signs out and refuses accounts that are not on the allowlist", async () => {
    vi.stubEnv("QUICKSYNC_ALLOWED_EMAILS", "owner@example.com");
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { email: "intruder@example.com" } },
      error: null,
    });
    auth.signOut.mockResolvedValue({ error: null });

    const state = await signIn({}, form({ email: "intruder@example.com", password: "pw" }));
    expect(state.error).toMatch(/not allowed/);
    expect(auth.signOut).toHaveBeenCalled();
  });
});

// --- Proxy (route protection) ------------------------------------------------------------

function request(path: string, method = "GET") {
  return new NextRequest(new URL(path, "https://quicksync.test"), { method });
}

describe("proxy route protection", () => {
  it("redirects signed-out visitors from the app to /login", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    const response = await updateSession(request("/"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("lets signed-out visitors open /login", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    const response = await updateSession(request("/login"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends signed-in users from /login to the app", async () => {
    auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1", email: "me@example.com" } },
      error: null,
    });
    const response = await updateSession(request("/login"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("treats accounts outside the allowlist as signed out", async () => {
    vi.stubEnv("QUICKSYNC_ALLOWED_EMAILS", "owner@example.com");
    auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-2", email: "intruder@example.com" } },
      error: null,
    });
    const response = await updateSession(request("/"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("does not redirect Server Action POSTs (they return a structured error instead)", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    const response = await updateSession(request("/", "POST"));
    expect(response.headers.get("location")).toBeNull();
  });
});
