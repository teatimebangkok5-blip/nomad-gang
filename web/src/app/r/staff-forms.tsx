"use client";

import { useActionState } from "react";
import { buttonClass, inputClass } from "@/components/form";
import { staffRedeem, staffSignIn, staffSignOut, type RedeemState, type StaffLoginState } from "./actions";
import { STAFF_TEXT, bangkokClock, type Bilingual } from "./staff";

export function Both({ text, className = "" }: { text: Bilingual; className?: string }) {
  return (
    <span className={className}>
      <span className="block">{text.th}</span>
      <span className="block text-[0.9em] opacity-80">{text.en}</span>
    </span>
  );
}

export function Notice({ text, tone = "bad" }: { text: Bilingual; tone?: "bad" | "good" | "info" }) {
  const colors =
    tone === "good"
      ? "bg-green-50 text-green-900 border-green-200"
      : tone === "info"
        ? "bg-white text-ink-800 border-ink-200"
        : "bg-red-50 text-red-900 border-red-200";
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${colors}`}>
      <Both text={text} />
    </div>
  );
}

// Venue login (staff stay logged in on this phone for 90 days).
export function StaffLoginForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<StaffLoginState, FormData>(staffSignIn.bind(null, token), {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <h1 className="text-lg font-semibold">
        <Both text={{ th: "เข้าสู่ระบบร้าน", en: "Venue login" }} />
      </h1>
      <p className="text-sm text-ink-600">
        <Both
          text={{
            th: "ใช้รหัสผู้ใช้และรหัสผ่านของร้านที่ได้รับจาก TableMeet เพื่อดูรหัสคูปอง",
            en: "Log in with your venue's TableMeet login to see the coupon code.",
          }}
        />
      </p>
      {state.error && <Notice text={state.error} />}
      <div>
        <label htmlFor="login" className="mb-1 block text-sm font-medium text-ink-800">
          รหัสผู้ใช้ · Login ID
        </label>
        <input id="login" name="login" autoComplete="username" autoCapitalize="none" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-800">
          รหัสผ่าน · Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={buttonClass("primary", "w-full py-3 text-base")}>
        {pending ? "…" : "เข้าสู่ระบบ · Log in"}
      </button>
    </form>
  );
}

// Shows what the QR is for; the button uses it up and shows the coupon code.
export function RedeemForm({
  token,
  dealTitle,
  checkedIn,
  expiresAt,
}: {
  token: string;
  dealTitle: Bilingual;
  checkedIn: number;
  expiresAt: string;
}) {
  const [state, action, pending] = useActionState<RedeemState>(() => staffRedeem(token), {});
  const result = state.result;

  if (result?.status === "ok") {
    return (
      <div className="space-y-4 rounded-2xl border border-green-200 bg-white p-5 text-center shadow-sm">
        <p className="text-sm font-medium text-green-800">
          <Both text={{ th: "ใช้คูปองสำเร็จ", en: "Coupon redeemed" }} />
        </p>
        <p className="text-sm text-ink-600">
          <Both text={{ th: result.deal_title_th, en: result.deal_title_en }} />
        </p>
        <p className="rounded-xl bg-ink-900 px-4 py-5 font-mono text-4xl font-bold tracking-widest text-white">
          {result.coupon_code}
        </p>
        <p className="text-sm text-ink-700">
          <Both
            text={{
              th: `เช็กอิน ${result.checked_in} คน · ${bangkokClock(result.redeemed_at)} น.`,
              en: `${result.checked_in} people checked in · ${bangkokClock(result.redeemed_at)}`,
            }}
          />
        </p>
        {result.member_names.length > 0 && (
          <p className="text-xs text-ink-500">{result.member_names.join(", ")}</p>
        )}
      </div>
    );
  }

  const problem =
    state.error ??
    (result?.status === "used"
      ? STAFF_TEXT.used
      : result?.status === "expired"
        ? STAFF_TEXT.expired
        : result?.status === "wrong_venue"
          ? STAFF_TEXT.wrongVenue
          : result?.status === "no_coupon"
            ? STAFF_TEXT.noCoupon
            : result?.status === "invalid"
              ? STAFF_TEXT.invalid
              : result?.status === "signed_out"
                ? { th: "กรุณาเข้าสู่ระบบอีกครั้ง (โหลดหน้านี้ใหม่)", en: "Please log in again (reload this page)." }
                : null);

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <p className="text-base font-semibold">
        <Both text={dealTitle} />
      </p>
      <p className="text-sm text-ink-700">
        <Both
          text={{
            th: `เช็กอินที่ร้านแล้ว ${checkedIn} คน · QR หมดอายุ ${bangkokClock(expiresAt)} น.`,
            en: `${checkedIn} people checked in here · QR expires at ${bangkokClock(expiresAt)}`,
          }}
        />
      </p>
      {problem && <Notice text={problem} />}
      <button type="submit" disabled={pending} className={buttonClass("primary", "w-full py-3 text-base")}>
        {pending ? "…" : "แสดงรหัสคูปอง · Show coupon code"}
      </button>
      <p className="text-xs text-ink-500">
        <Both
          text={{
            th: "กดเมื่อพร้อมให้ส่วนลด รหัสใช้ได้ครั้งเดียว",
            en: "Tap when you're ready to apply the discount. The code works once.",
          }}
        />
      </p>
    </form>
  );
}

export function SignOutButton({ token }: { token: string }) {
  return (
    <form action={staffSignOut.bind(null, token)}>
      <button type="submit" className="text-sm font-medium text-brand-700 underline">
        ออกจากระบบ · Log out
      </button>
    </form>
  );
}
