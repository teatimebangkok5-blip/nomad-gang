import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { STAFF_COOKIE, STAFF_TEXT, isQrToken, type QrCheck } from "../staff";
import { Both, Notice, RedeemForm, SignOutButton, StaffLoginForm } from "../staff-forms";

export const metadata: Metadata = { title: { absolute: "TableMeet coupon" }, robots: { index: false, follow: false } };

// The page a redemption QR opens. Venue staff log in with their venue's login first (anyone else, including the
// group itself, only ever sees the login form); then they see what the QR is for and tap to get the coupon code,
// which uses the QR up and records the redemption for the founder.
export default function RedeemPage({ params }: PageProps<"/r/[token]">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-5 px-4 py-8">
      <p className="text-center text-lg font-semibold text-ink-900">
        Table<span className="text-brand-600">M</span>
        <span className="text-pink-500">eet</span>
      </p>
      <Suspense fallback={<p className="text-center text-sm text-ink-500">กำลังโหลด… · Loading…</p>}>
        <QrStatus params={params} />
      </Suspense>
    </main>
  );
}

async function QrStatus({ params }: { params: PageProps<"/r/[token]">["params"] }) {
  const { token } = await params;
  if (!isQrToken(token)) {
    return <Notice text={STAFF_TEXT.invalid} />;
  }

  const session = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!session) {
    return <StaffLoginForm token={token} />;
  }

  const supabase = createServiceClient();
  const [{ data: staff }, { data: check, error }] = await Promise.all([
    supabase.rpc("staff_session", { p_session_token: session }),
    supabase.rpc("staff_check_qr", { p_session_token: session, p_qr_token: token }),
  ]);
  const me = (staff as { login_id: string; venue_name_en: string; venue_name_th: string }[] | null)?.[0];
  if (!me) {
    return <StaffLoginForm token={token} />;
  }
  if (error || !check) {
    return <Notice text={STAFF_TEXT.generic} />;
  }

  const qr = check as QrCheck;
  return (
    <>
      <p className="text-center text-sm text-ink-600">
        <Both text={{ th: me.venue_name_th, en: me.venue_name_en }} className="font-medium text-ink-800" />
      </p>
      {qr.status === "ok" ? (
        <RedeemForm
          token={token}
          dealTitle={{ th: qr.deal_title_th, en: qr.deal_title_en }}
          checkedIn={qr.checked_in}
          expiresAt={qr.expires_at}
        />
      ) : (
        <Notice
          text={
            qr.status === "used"
              ? STAFF_TEXT.used
              : qr.status === "expired"
                ? STAFF_TEXT.expired
                : qr.status === "wrong_venue"
                  ? STAFF_TEXT.wrongVenue
                  : STAFF_TEXT.invalid
          }
        />
      )}
      <div className="flex items-center justify-center gap-2 text-sm text-ink-500">
        <span>{me.login_id}</span>
        <span aria-hidden>·</span>
        <SignOutButton token={token} />
      </div>
    </>
  );
}
