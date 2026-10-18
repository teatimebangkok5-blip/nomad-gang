import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalArticle, PublicPage } from "@/components/public-page";
import { legalDoc } from "@/lib/legal-content";
import { pageLanguage, siteContact } from "@/lib/site";

export const metadata: Metadata = { title: { absolute: "Terms of Use · TableMeet" }, robots: { index: true, follow: true } };

export default function TermsPage({ searchParams }: PageProps<"/terms">) {
  return (
    <Suspense>
      <Terms searchParams={searchParams} />
    </Suspense>
  );
}

async function Terms({ searchParams }: { searchParams: PageProps<"/terms">["searchParams"] }) {
  const language = pageLanguage((await searchParams).lang);
  return (
    <PublicPage path="/terms" language={language}>
      <LegalArticle doc={legalDoc("terms", language, siteContact())} />
    </PublicPage>
  );
}
