import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Data Access Layer check for the admin panel. Call at the start of every admin page and Server Action.
// Returns a Supabase client acting as the founder; redirects anyone else to the login page.
export async function requireAdmin() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    redirect("/admin/login");
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || !isAdmin) {
    redirect("/admin/login?error=not_admin");
  }

  return supabase;
}
