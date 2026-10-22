import { timingSafeEqual } from "node:crypto";

import { logServerError } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fallback cleanup for expired messages, for projects that cannot use pg_cron.
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. pg_cron (set up by
 * the migration) is the primary mechanism; expired rows are hidden by RLS either way.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const admin = createAdminClient();

  if (!secret || !admin) {
    return Response.json({ error: "Cleanup endpoint is not configured." }, { status: 501 });
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await admin.rpc("purge_expired_messages");
  if (error) {
    logServerError("cron.cleanup", error);
    return Response.json({ error: "Cleanup failed." }, { status: 500 });
  }

  return Response.json({ deleted: data }, { headers: { "Cache-Control": "no-store" } });
}

function isAuthorized(header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
