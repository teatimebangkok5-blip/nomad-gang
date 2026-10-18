import type { LegalContact, LegalLanguage } from "@/lib/legal-content";

// This website's public address: NEXT_PUBLIC_SITE_URL if set, else Vercel's production address.
export function siteUrl(): string | null {
  const own = process.env.NEXT_PUBLIC_SITE_URL;
  if (own) return own.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : null;
}

// Business name and public contact email for the Terms / Privacy / Delete account pages (empty → generic wording).
export function siteContact(): LegalContact {
  return {
    operator: process.env.NEXT_PUBLIC_BUSINESS_NAME || null,
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
    webUrl: siteUrl(),
  };
}

export function pageLanguage(value: string | string[] | undefined): LegalLanguage {
  return value === "th" ? "th" : "en";
}
