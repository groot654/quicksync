import { cn } from "@/lib/utils";

/** The QuickSync mark: two opposing arrows, for text moving between devices. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="qs-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="url(#qs-mark-bg)" />
      <g fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
        <path d="M150 200h200M300 150l50 50-50 50" />
        <path d="M362 312H162M212 262l-50 50 50 50" />
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">QuickSync</span>
    </span>
  );
}
