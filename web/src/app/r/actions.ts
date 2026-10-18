"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { STAFF_COOKIE, STAFF_COOKIE_MAX_AGE, STAFF_TEXT, isQrToken, type Bilingual, type RedeemResult } from "./staff";

// Server Actions for the staff QR page. Staff aren't Supabase users: every check runs in the database (staff_*
// functions, service role only). Errors are returned, not thrown, because thrown messages are hidden in production.

export type StaffLoginState = { error?: Bilingual };

export async function staffSignIn(token: string, _prev: StaffLoginState, formData: FormData): Promise<StaffLoginState> {
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!login || !password) {
    return { error: STAFF_TEXT.missing };
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null;
  const { data, error } = await createServiceClient().rpc("staff_sign_in", {
    p_login_id: login,
    p_password: password,
    p_ip: ip,
  });
  if (error) {
    return { error: error.message.includes("too_many_attempts") ? STAFF_TEXT.tooMany : STAFF_TEXT.generic };
  }
  const session = (data as { session_token: string }[] | null)?.[0]?.session_token;
  if (!session) {
    return { error: STAFF_TEXT.wrong };
  }

  (await cookies()).set(STAFF_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/r",
    maxAge: STAFF_COOKIE_MAX_AGE,
  });
  redirect(`/r/${isQrToken(token) ? token : ""}`);
}

export type RedeemState = { result?: RedeemResult; error?: Bilingual };

// Uses up the QR and returns the coupon code (staff_redeem checks the session, the venue and the 15 minutes).
export async function staffRedeem(token: string): Promise<RedeemState> {
  const session = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!session) {
    return { result: { status: "signed_out" } };
  }
  const { data, error } = await createServiceClient().rpc("staff_redeem", {
    p_session_token: session,
    p_qr_token: token,
  });
  if (error || !data) {
    return { error: STAFF_TEXT.generic };
  }
  return { result: data as RedeemResult };
}

export async function staffSignOut(token: string) {
  const cookieStore = await cookies();
  const session = cookieStore.get(STAFF_COOKIE)?.value;
  if (session) {
    await createServiceClient().rpc("staff_sign_out", { p_session_token: session });
  }
  cookieStore.set(STAFF_COOKIE, "", { path: "/r", maxAge: 0 });
  redirect(`/r/${isQrToken(token) ? token : ""}`);
}
