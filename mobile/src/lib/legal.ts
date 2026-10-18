import type { LegalContact } from '@/legal/content';

// The founder's business name, public contact email and website for the Terms / Privacy texts. Baked into the app at
// build time; empty values fall back to generic wording.
export const legalContact: LegalContact = {
  operator: process.env.EXPO_PUBLIC_BUSINESS_NAME || null,
  email: process.env.EXPO_PUBLIC_CONTACT_EMAIL || null,
  webUrl: process.env.EXPO_PUBLIC_WEB_URL || null,
};
