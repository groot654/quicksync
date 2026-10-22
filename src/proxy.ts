import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything except:
     * - Next.js internals and static assets
     * - PWA files (manifest, service worker, icons, offline page)
     * - the cron cleanup endpoint, which authenticates with its own secret
     * - any other request for a file with an extension
     */
    "/((?!_next/static|_next/image|api/cron|manifest.webmanifest|sw.js|offline.html|icons/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
