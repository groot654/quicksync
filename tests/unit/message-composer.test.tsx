import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const createMessage = vi.hoisted(() => vi.fn());
vi.mock("@/features/messages/actions", () => ({ createMessage }));

const { MessageComposer } = await import("@/features/messages/components/message-composer");

const stored = {
  id: "9d7a4f3e-2b1c-4d5e-8f6a-7b8c9d0e1f2a",
  content: "hello",
  created_at: "2030-01-01T00:00:00.000Z",
  expires_at: "2030-01-02T00:00:00.000Z",
};

function setup(online = true) {
  const onSent = vi.fn();
  const onUnauthorized = vi.fn();
  render(<MessageComposer online={online} onSent={onSent} onUnauthorized={onUnauthorized} />);
  return {
    onSent,
    onUnauthorized,
    textbox: screen.getByRole("textbox", { name: "Message" }),
    sendButton: () => screen.getByRole("button", { name: /send|sending|offline/i }),
  };
}

beforeEach(() => {
  createMessage.mockReset();
  Object.values(toast).forEach((fn) => fn.mockReset());
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

describe("MessageComposer", () => {
  it("disables Send for empty or whitespace-only text", async () => {
    const { textbox, sendButton } = setup();
    expect(sendButton()).toBeDisabled();
    await userEvent.type(textbox, "   ");
    expect(sendButton()).toBeDisabled();
  });

  it("sends the text exactly, then clears the box", async () => {
    createMessage.mockResolvedValue({ ok: true, data: stored });
    const { textbox, sendButton, onSent } = setup();

    await userEvent.type(textbox, "  line 1{Enter}line 2 ✅");
    await userEvent.click(sendButton());

    expect(createMessage).toHaveBeenCalledWith({
      clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      content: "  line 1\nline 2 ✅",
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(stored));
    expect(textbox).toHaveValue("");
  });

  it("sends only once when Send is tapped repeatedly", async () => {
    let resolve!: (value: unknown) => void;
    createMessage.mockReturnValue(new Promise((r) => (resolve = r)));
    const { textbox, sendButton } = setup();

    await userEvent.type(textbox, "hello");
    const button = sendButton();
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(sendButton()).toBeDisabled();
    await act(async () => resolve({ ok: true, data: stored }));
  });

  it("keeps the text after a network failure and retries with the same idempotency key", async () => {
    createMessage.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { textbox, sendButton } = setup();

    await userEvent.type(textbox, "important");
    await userEvent.click(sendButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(textbox).toHaveValue("important");

    createMessage.mockResolvedValueOnce({ ok: true, data: stored });
    await userEvent.click(sendButton());

    const [first, second] = createMessage.mock.calls.map(([input]) => input.clientId);
    expect(second).toBe(first);
  });

  it("uses a new idempotency key once the text is edited", async () => {
    createMessage.mockResolvedValueOnce({ ok: false, error: { code: "SERVER", message: "x" } });
    const { textbox, sendButton } = setup();

    await userEvent.type(textbox, "draft");
    await userEvent.click(sendButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    await userEvent.type(textbox, " edited");
    createMessage.mockResolvedValueOnce({ ok: true, data: stored });
    await userEvent.click(sendButton());

    const [first, second] = createMessage.mock.calls.map(([input]) => input.clientId);
    expect(second).not.toBe(first);
  });

  it("does not send while offline", async () => {
    const { textbox, sendButton } = setup(false);
    await userEvent.type(textbox, "later");
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveTextContent("Offline");
  });

  it("hands off to sign-in when the session has expired", async () => {
    createMessage.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Your session has expired." },
    });
    const { textbox, sendButton, onUnauthorized } = setup();

    await userEvent.type(textbox, "hello");
    await userEvent.click(sendButton());
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
