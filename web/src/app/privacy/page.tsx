import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalArticle, PublicPage } from "@/components/public-page";
import { legalDoc } from "@/lib/legal-content";
import { pageLanguage, siteContact } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy · TableMeet" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage({ searchParams }: PageProps<"/privacy">) {
  return (
    <Suspense>
      <Privacy searchParams={searchParams} />
    </Suspense>
  );
}

async function Privacy({ searchParams }: { searchParams: PageProps<"/privacy">["searchParams"] }) {
  const language = pageLanguage((await searchParams).lang);
  return (
    <PublicPage path="/privacy" language={language}>
      <LegalArticle doc={legalDoc("privacy", language, siteContact())} />
    </PublicPage>
  );
}
