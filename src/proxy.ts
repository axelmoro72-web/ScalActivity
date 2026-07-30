import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Convention Next 16 : "proxy" remplace "middleware".
export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Tout sauf les assets statiques.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
