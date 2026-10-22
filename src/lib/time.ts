const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** "just now", "5 min. ago", "2 hours ago", "yesterday". */
export function formatRelativeTime(timestamp: string | number | Date, now: number): string {
  const time = new Date(timestamp).getTime();
  const diff = time - now;
  const abs = Math.abs(diff);

  if (abs < 45_000) return "just now";
  if (abs < HOUR) return relativeFormatter.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return relativeFormatter.format(Math.round(diff / HOUR), "hour");
  return relativeFormatter.format(Math.round(diff / DAY), "day");
}

/** "Oct 22, 2026, 10:42 AM" in the viewer's locale and time zone. */
export function formatAbsoluteTime(timestamp: string | number | Date): string {
  return absoluteFormatter.format(new Date(timestamp));
}

/** "23h left", "45m left", "<1m left". */
export function formatTimeRemaining(expiresAt: string, now: number): string {
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= MINUTE) return "<1m left";
  if (remaining < HOUR) return `${Math.ceil(remaining / MINUTE)}m left`;
  return `${Math.ceil(remaining / HOUR)}h left`;
}
