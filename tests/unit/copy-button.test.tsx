import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { CopyButton } = await import("@/features/messages/components/copy-button");

const MULTILINE = "Line one\nLine two\n\n  indented — ✅ 123456";

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("CopyButton", () => {
  it("copies the exact multiline content and confirms", async () => {
    const writeText = mockClipboard(async () => {});
    render(<CopyButton text={MULTILINE} label="Copy" />);

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(MULTILINE);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalled();
  });

  it("falls back to execCommand when the Clipboard API is denied", async () => {
    mockClipboard(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    render(<CopyButton text={MULTILINE} label="Copy" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("explains the manual fallback when every copy method fails", async () => {
    mockClipboard(async () => {
      throw new Error("denied");
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
    const onCopyFailed = vi.fn();

    render(<CopyButton text="secret" accessibleLabel="Copy message" onCopyFailed={onCopyFailed} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onCopyFailed).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  });
});
