import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Client service_role : contourne la RLS. Import "server-only" : le build
// échoue si ce module est importé depuis un Client Component. La clé ne
// doit jamais apparaître dans une variable NEXT_PUBLIC_*.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
