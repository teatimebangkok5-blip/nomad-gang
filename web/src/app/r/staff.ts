// Shared by the staff QR page and its Server Actions. Venue staff see Thai and English side by side.

// Session cookie for venue staff (90 days, only sent to /r/...). Holds a random token; the database keeps its hash.
export const STAFF_COOKIE = "tm_staff";
export const STAFF_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

// QR tokens are 48 hex characters (issue_redemption_qr).
export function isQrToken(token: string): boolean {
  return /^[0-9a-f]{48}$/.test(token);
}

export type Bilingual = { en: string; th: string };

export type QrCheck =
  | { status: "ok"; venue_name_en: string; deal_title_en: string; deal_title_th: string; checked_in: number; expires_at: string }
  | { status: "used"; used_at: string }
  | { status: "signed_out" | "invalid" | "expired" | "wrong_venue" };

export type RedeemResult =
  | {
      status: "ok";
      coupon_code: string;
      deal_title_en: string;
      deal_title_th: string;
      venue_name_en: string;
      checked_in: number;
      member_names: string[];
      redeemed_at: string;
    }
  | { status: "used"; used_at: string }
  | { status: "signed_out" | "invalid" | "expired" | "wrong_venue" | "no_coupon" };

export const STAFF_TEXT = {
  invalid: { en: "This QR code isn't valid.", th: "QR โค้ดนี้ไม่ถูกต้อง" },
  expired: {
    en: "This QR code has expired. Ask the group to show a new one in the app.",
    th: "QR โค้ดนี้หมดอายุแล้ว ขอให้ลูกค้าแสดง QR โค้ดใหม่ในแอป",
  },
  used: { en: "This QR code was already used.", th: "QR โค้ดนี้ถูกใช้ไปแล้ว" },
  wrongVenue: {
    en: "This QR code is for another venue. Log out and log in with this venue's login.",
    th: "QR โค้ดนี้เป็นของร้านอื่น ออกจากระบบแล้วเข้าสู่ระบบด้วยบัญชีของร้านนี้",
  },
  noCoupon: { en: "This promotion has ended.", th: "โปรโมชันนี้สิ้นสุดแล้ว" },
  missing: { en: "Enter your login ID and password.", th: "กรอกรหัสผู้ใช้และรหัสผ่าน" },
  wrong: {
    en: "Wrong login ID or password, or the login is locked for 15 minutes.",
    th: "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกล็อก 15 นาที",
  },
  tooMany: {
    en: "Too many wrong tries. Wait 15 minutes and try again.",
    th: "ลองผิดหลายครั้งเกินไป รอ 15 นาทีแล้วลองใหม่",
  },
  generic: { en: "Something went wrong. Please try again.", th: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" },
} satisfies Record<string, Bilingual>;

// Clock time in Bangkok, e.g. "19:42".
export function bangkokClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}
