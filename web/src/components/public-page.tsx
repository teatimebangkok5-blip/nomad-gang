import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalDoc, LegalLanguage } from "@/lib/legal-content";

// Frame for the public pages (Terms, Privacy, Delete account): logo, English / ไทย switch, readable column.
export function PublicPage({ path, language, children }: { path: string; language: LegalLanguage; children: ReactNode }) {
  return (
    <main lang={language} className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <p className="text-lg font-semibold text-ink-900">
          Table<span className="text-brand-600">M</span>
          <span className="text-pink-500">eet</span>
        </p>
        <nav aria-label="Language" className="flex gap-3 text-sm">
          <Link href={path} aria-current={language === "en" ? "page" : undefined} className={language === "en" ? "font-semibold" : "text-brand-700 underline"}>
            English
          </Link>
          <Link href={`${path}?lang=th`} aria-current={language === "th" ? "page" : undefined} className={language === "th" ? "font-semibold" : "text-brand-700 underline"}>
            ไทย
          </Link>
        </nav>
      </div>
      <div className="mt-8">{children}</div>
      <footer className="mt-12 flex flex-wrap gap-4 border-t border-ink-200 pt-4 text-sm text-ink-600">
        <Link href={`/terms${language === "th" ? "?lang=th" : ""}`} className="underline">
          {language === "th" ? "ข้อกำหนดการใช้งาน" : "Terms of Use"}
        </Link>
        <Link href={`/privacy${language === "th" ? "?lang=th" : ""}`} className="underline">
          {language === "th" ? "นโยบายความเป็นส่วนตัว" : "Privacy Policy"}
        </Link>
        <Link href={`/delete-account${language === "th" ? "?lang=th" : ""}`} className="underline">
          {language === "th" ? "ลบบัญชี" : "Delete your account"}
        </Link>
      </footer>
    </main>
  );
}

export function LegalArticle({ doc }: { doc: LegalDoc }) {
  return (
    <article className="space-y-3 text-[15px] leading-relaxed text-ink-800">
      <h1 className="text-3xl font-semibold text-ink-900">{doc.title}</h1>
      <p className="text-sm text-ink-500">{doc.updated}</p>
      {doc.intro.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {doc.sections.map((section) => (
        <section key={section.heading} className="space-y-2 pt-4">
          <h2 className="text-lg font-semibold text-ink-900">{section.heading}</h2>
          {section.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
