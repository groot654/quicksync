import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { setAutoCopyCodes } = await import("@/features/notifications/auto-copy");
const { useCodeAutoCopy } = await import("@/features/notifications/hooks/use-code-auto-copy");
const { useNotificationIntents } =
  await import("@/features/notifications/hooks/use-notification-intents");

const MESSAGE_ID = "9d7a4f3e-2b1c-4d5e-8f6a-7b8c9d0e1f2a";
const OTP_MESSAGE = {
  id: MESSAGE_ID,
  content: "Your bank verification code is 905512. Don't share it.",
  created_at: "2026-10-22T10:00:00.000Z",
  expires_at: "2026-10-23T10:00:00.000Z",
};

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toast.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  window.localStorage.clear();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useCodeAutoCopy", () => {
  it("copies a code that arrives from another device", async () => {
    const { result } = renderHook(() => useCodeAutoCopy());
    act(() => result.current.handleIncoming(OTP_MESSAGE, "other-device-key"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("905512"));
    expect(toast.success).toHaveBeenCalledWith("Code 905512 copied", expect.anything());
  });

  it("ignores messages sent from this device", () => {
    const { result } = renderHook(() => useCodeAutoCopy());
    act(() => {
      result.current.markSent("my-key");
      result.current.handleIncoming(OTP_MESSAGE, "my-key");
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("respects the auto-copy setting", () => {
    setAutoCopyCodes(false);
    const { result } = renderHook(() => useCodeAutoCopy());
    act(() => result.current.handleIncoming(OTP_MESSAGE, null));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does nothing while the app isn't focused", () => {
    vi.mocked(document.hasFocus).mockReturnValue(false);
    const { result } = renderHook(() => useCodeAutoCopy());
    act(() => result.current.handleIncoming(OTP_MESSAGE, null));
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("useNotificationIntents", () => {
  it("copies the code from a 'Copy code' notification action and tidies the URL", async () => {
    window.history.replaceState(null, "", `/?notification=copy-code&message=${MESSAGE_ID}`);
    renderHook(() => useNotificationIntents([OTP_MESSAGE]));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("905512"));
    expect(window.location.search).toBe("");
  });

  it("copies the whole message for 'Copy message'", async () => {
    window.history.replaceState(null, "", `/?notification=copy&message=${MESSAGE_ID}`);
    renderHook(() => useNotificationIntents([OTP_MESSAGE]));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(OTP_MESSAGE.content));
  });

  it("waits for the message to arrive before copying", async () => {
    window.history.replaceState(null, "", `/?notification=copy-code&message=${MESSAGE_ID}`);
    const { rerender } = renderHook(({ messages }) => useNotificationIntents(messages), {
      initialProps: { messages: [] as (typeof OTP_MESSAGE)[] },
    });
    expect(writeText).not.toHaveBeenCalled();

    rerender({ messages: [OTP_MESSAGE] });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("905512"));
  });

  it("on a plain tap, copies the code only when auto-copy is on", async () => {
    setAutoCopyCodes(false);
    window.history.replaceState(null, "", `/?notification=open&message=${MESSAGE_ID}`);
    renderHook(() => useNotificationIntents([OTP_MESSAGE]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("offers a button when the browser needs a tap to copy (Safari)", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
    window.history.replaceState(null, "", `/?notification=copy-code&message=${MESSAGE_ID}`);

    renderHook(() => useNotificationIntents([OTP_MESSAGE]));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Copy code",
        expect.objectContaining({ action: expect.objectContaining({ label: "Copy code" }) }),
      ),
    );
  });
});
