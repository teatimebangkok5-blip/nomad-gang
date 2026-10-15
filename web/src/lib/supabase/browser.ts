import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

// Supabase client for Client Components (used for direct photo uploads to Storage).
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
