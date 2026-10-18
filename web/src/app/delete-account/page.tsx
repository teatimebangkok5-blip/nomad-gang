import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicPage } from "@/components/public-page";
import type { LegalLanguage } from "@/lib/legal-content";
import { pageLanguage, siteContact } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Delete your account · TableMeet" },
  robots: { index: true, follow: true },
};

// The "delete account" web address for the Google Play listing: how to delete in the app, what is deleted and kept,
// and how to ask without the app.
export default function DeleteAccountPage({ searchParams }: PageProps<"/delete-account">) {
  return (
    <Suspense>
      <DeleteAccount searchParams={searchParams} />
    </Suspense>
  );
}

const TEXT: Record<
  LegalLanguage,
  { title: string; intro: string; steps: string[]; deletedTitle: string; deleted: string[]; keptTitle: string; kept: string[]; noAppTitle: string; noAppEmail: string; noApp: string }
> = {
  en: {
    title: "Delete your TableMeet account",
    intro: "You can delete your account and its data yourself in the app at any time. It happens straight away and can't be undone.",
    steps: [
      "Open TableMeet and sign in.",
      "Tap the settings button (⚙) at the top right of the map.",
      "Under Account, tap Delete account.",
      "Confirm twice. You're signed out and your account is gone.",
    ],
    deletedTitle: "What is deleted",
    deleted: [
      "Your sign-in, profile, birthday, photos and Instagram username",
      "Messages, photos, voice notes and live locations you sent",
      "Trips, favourites, day plans, follows, check-ins and the 👍 / 👎 you gave",
      "Blocks and reports you made",
    ],
    keptTitle: "What is kept",
    kept: [
      "Tables and hangouts you hosted that other people joined stay for them (cancelled if still upcoming), with another member as host.",
      "Coupon records (venue, time and the names of the people checked in) are kept for up to 5 years for accounting with venues.",
    ],
    noAppTitle: "Can't use the app?",
    noAppEmail: "Email {email} from the email address of your Google or Apple account and ask us to delete your account. We'll do it within 30 days and confirm by email.",
    noApp: "Contact us through the developer contact on TableMeet's Google Play page and ask us to delete your account. We'll do it within 30 days.",
  },
  th: {
    title: "ลบบัญชี TableMeet ของคุณ",
    intro: "คุณลบบัญชีและข้อมูลได้เองในแอปทุกเมื่อ การลบเกิดขึ้นทันทีและย้อนกลับไม่ได้",
    steps: [
      "เปิด TableMeet และเข้าสู่ระบบ",
      "แตะปุ่มตั้งค่า (⚙) มุมขวาบนของแผนที่",
      "ในหัวข้อ บัญชี แตะ ลบบัญชี",
      "ยืนยันสองครั้ง ระบบจะออกจากระบบและลบบัญชีของคุณ",
    ],
    deletedTitle: "ข้อมูลที่ถูกลบ",
    deleted: [
      "การเข้าสู่ระบบ โปรไฟล์ วันเกิด รูปภาพ และชื่อผู้ใช้ Instagram",
      "ข้อความ รูปภาพ ข้อความเสียง และตำแหน่งสดที่คุณส่ง",
      "ทริป สถานที่โปรด แผนเที่ยว การติดตาม การเช็กอิน และ 👍 / 👎 ที่คุณให้",
      "การบล็อกและรายงานที่คุณทำ",
    ],
    keptTitle: "ข้อมูลที่ยังเก็บไว้",
    kept: [
      "โต๊ะและแฮงเอาท์ที่คุณเป็นเจ้าภาพซึ่งมีผู้อื่นเข้าร่วมจะยังอยู่สำหรับพวกเขา (ถูกยกเลิกหากยังไม่ถึงเวลา) โดยมีสมาชิกอีกคนเป็นเจ้าภาพแทน",
      "บันทึกการใช้คูปอง (ร้าน เวลา และชื่อของผู้ที่เช็กอิน) เก็บไว้ไม่เกิน 5 ปีเพื่อการบัญชีกับร้าน",
    ],
    noAppTitle: "ใช้แอปไม่ได้?",
    noAppEmail: "ส่งอีเมลถึง {email} จากอีเมลของบัญชี Google หรือ Apple ของคุณเพื่อขอลบบัญชี เราจะดำเนินการภายใน 30 วันและยืนยันทางอีเมล",
    noApp: "ติดต่อเราผ่านช่องทางติดต่อผู้พัฒนาในหน้า Google Play ของ TableMeet เพื่อขอลบบัญชี เราจะดำเนินการภายใน 30 วัน",
  },
};

async function DeleteAccount({ searchParams }: { searchParams: PageProps<"/delete-account">["searchParams"] }) {
  const language = pageLanguage((await searchParams).lang);
  const text = TEXT[language];
  const email = siteContact().email;

  return (
    <PublicPage path="/delete-account" language={language}>
      <article className="space-y-4 text-[15px] leading-relaxed text-ink-800">
        <h1 className="text-3xl font-semibold text-ink-900">{text.title}</h1>
        <p>{text.intro}</p>
        <ol className="list-decimal space-y-1 pl-6">
          {text.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h2 className="pt-4 text-lg font-semibold text-ink-900">{text.deletedTitle}</h2>
        <ul className="list-disc space-y-1 pl-6">
          {text.deleted.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2 className="pt-4 text-lg font-semibold text-ink-900">{text.keptTitle}</h2>
        <ul className="list-disc space-y-1 pl-6">
          {text.kept.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2 className="pt-4 text-lg font-semibold text-ink-900">{text.noAppTitle}</h2>
        <p>{email ? text.noAppEmail.replace("{email}", email) : text.noApp}</p>
      </article>
    </PublicPage>
  );
}
