import { InboxIcon } from "lucide-react";

import { MESSAGE_RETENTION_HOURS } from "../constants";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <InboxIcon className="size-7" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold">Nothing synced yet</h3>
      <p className="mt-1.5 max-w-xs text-sm text-pretty text-muted-foreground">
        Paste text above and tap Send. It shows up instantly on every device you&apos;re signed in
        on.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Messages delete themselves after {MESSAGE_RETENTION_HOURS} hours.
      </p>
    </div>
  );
}
