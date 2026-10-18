import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

// Supabase client with the secret (service-role) key, for the staff QR page only: venue staff aren't Supabase users,
// and the staff_* database functions may only be called by the service role. Never import this in client code.
export function createServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing environment variable SUPABASE_SECRET_KEY. See web/.env.example.");
  }
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
