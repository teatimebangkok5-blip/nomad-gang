// TableMeet's Terms of Use and Privacy Policy in English and Thai: shown in the app (src/app/legal/[doc].tsx) and on
// the public web pages (/terms, /privacy). This file is copied byte for byte to web/src/lib/legal-content.ts; edit it
// here, then run `npm run sync:legal` in mobile/ (`npm run check:legal` fails if the copies differ).
// Plain data, no imports, so both apps can use it.
//
// Draft written for the founder to review (ideally with a Thai lawyer) before launch.

export type LegalLanguage = 'en' | 'th';
export type LegalDocId = 'terms' | 'privacy';
export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDoc = { title: string; updated: string; intro: string[]; sections: LegalSection[] };

// Business name, public contact email and the website (for the account-deletion page). Empty until the founder
// sets them; the texts then use generic wording.
export type LegalContact = { operator: string | null; email: string | null; webUrl: string | null };

const UPDATED: Record<LegalLanguage, string> = { en: '18 October 2026', th: '18 ตุลาคม 2569' };

type RawDoc = { title: string; intro: string[]; sections: LegalSection[] };

const TERMS: Record<LegalLanguage, RawDoc> = {
  en: {
    title: 'Terms of Use',
    intro: [
      'TableMeet ("the app") is run by {operator} ("we", "us"). It helps people meet up to eat, drink and spend time together, mainly in Bangkok, Thailand.',
      "By creating an account or using TableMeet you agree to these Terms and to our Privacy Policy. If you don't agree, please don't use the app.",
    ],
    sections: [
      {
        heading: '1. Who can use TableMeet',
        paragraphs: [
          'You must be at least 18 years old. In Thailand you must be 20 or older to buy or drink alcohol; follow the law wherever you are.',
          'One account per person. Give true information about yourself and keep your account safe. You are responsible for what happens in your account.',
        ],
      },
      {
        heading: '2. Meeting people safely',
        paragraphs: [
          "The people you meet through TableMeet are strangers until you meet them. We don't check anyone's identity or background, and we can't promise how anyone will behave.",
          'Meet in public places, keep your drinks and belongings with you, plan your own way home and leave whenever you feel unsafe. In an emergency in Thailand call 191 (police) or 1155 (tourist police).',
        ],
      },
      {
        heading: '3. Rules for content and behaviour',
        paragraphs: [
          'We have zero tolerance for objectionable content and abusive users. Do not post, send or do anything that:',
          '• harasses, threatens, bullies, stalks or discriminates against anyone, or is hateful or violent;',
          '• is sexual, nude or pornographic, or involves anyone under 18;',
          "• is spam, a scam, advertising or selling, or is illegal, including drugs and weapons;",
          "• pretends to be someone else, or shares other people's private information or photos without their permission.",
          'You keep the rights to what you post (messages, photos, voice notes, your profile). You allow us to store it and show it to the people you share it with, so the app can work.',
        ],
      },
      {
        heading: '4. Blocking, reporting and moderation',
        paragraphs: [
          'You can block or report anyone from their profile, from a chat, or in Travellers. Blocking hides you from each other.',
          "We review reports and may remove content, and suspend or delete accounts that break these Terms, without notice. We aim to act on reports of objectionable content within 24 hours.",
        ],
      },
      {
        heading: '5. Partner venues, coupons and deals',
        paragraphs: [
          'Coupons are given by partner venues. A discount or offer unlocks only when at least 3 members of a table are checked in at the venue (1 for ticket discounts). The QR code works once and expires 15 minutes after it is shown. Only venue staff can see the coupon code.',
          'Venues decide their offers and may change or end them. The venue, not TableMeet, is responsible for its food, drinks, tickets, prices and service.',
          "Don't misuse coupons, for example by faking a check-in or sharing a code. We may cancel coupons and accounts that do.",
          'Travel deals, ticket pages, booking sites and other websites we link to are run by others under their own terms.',
        ],
      },
      {
        heading: '6. Location',
        paragraphs: [
          'The map, check-in and Travellers use your phone\'s location. Live location in a chat is shared only when you start it, and only while the app is open. The Privacy Policy explains what we keep.',
        ],
      },
      {
        heading: '7. The service',
        paragraphs: [
          'TableMeet is free to use. We may change, pause or stop features at any time.',
          'You can delete your account at any time in Settings → Delete account. We may suspend or close accounts that break these Terms or the law.',
        ],
      },
      {
        heading: '8. Our responsibility',
        paragraphs: [
          'TableMeet is provided "as is". As far as the law allows, we are not responsible for what people do before, during or after a meetup, for venues\' products and services, or for indirect losses.',
          'Nothing in these Terms limits rights you have under Thai consumer law that cannot be excluded.',
        ],
      },
      {
        heading: '9. Law and changes',
        paragraphs: [
          'These Terms are governed by the laws of Thailand, and the courts of Thailand decide any dispute.',
          'We may update these Terms. The date at the top shows the latest version, and we will tell you in the app about important changes. Using TableMeet after a change means you accept it.',
        ],
      },
      {
        heading: '10. Contact',
        paragraphs: ['{contact}'],
      },
    ],
  },
  th: {
    title: 'ข้อกำหนดการใช้งาน',
    intro: [
      'TableMeet ("แอป") ดำเนินการโดย {operator} ("เรา") เป็นแอปที่ช่วยให้ผู้คนนัดพบกันเพื่อกิน ดื่ม และใช้เวลาร่วมกัน โดยเฉพาะในกรุงเทพฯ ประเทศไทย',
      'เมื่อคุณสร้างบัญชีหรือใช้ TableMeet ถือว่าคุณยอมรับข้อกำหนดนี้และนโยบายความเป็นส่วนตัวของเรา หากคุณไม่ยอมรับ โปรดอย่าใช้แอป',
    ],
    sections: [
      {
        heading: '1. ผู้ที่ใช้ TableMeet ได้',
        paragraphs: [
          'คุณต้องมีอายุอย่างน้อย 18 ปี ในประเทศไทยต้องมีอายุ 20 ปีขึ้นไปจึงจะซื้อหรือดื่มเครื่องดื่มแอลกอฮอล์ได้ โปรดปฏิบัติตามกฎหมายในที่ที่คุณอยู่',
          'หนึ่งคนต่อหนึ่งบัญชี ให้ข้อมูลที่เป็นจริงเกี่ยวกับตัวคุณและดูแลบัญชีของคุณให้ปลอดภัย คุณเป็นผู้รับผิดชอบต่อสิ่งที่เกิดขึ้นในบัญชีของคุณ',
        ],
      },
      {
        heading: '2. การพบปะผู้คนอย่างปลอดภัย',
        paragraphs: [
          'คนที่คุณพบผ่าน TableMeet เป็นคนแปลกหน้าจนกว่าคุณจะได้พบกัน เราไม่ได้ตรวจสอบตัวตนหรือประวัติของผู้ใด และไม่สามารถรับประกันพฤติกรรมของใครได้',
          'นัดพบในที่สาธารณะ เก็บเครื่องดื่มและสิ่งของไว้กับตัว วางแผนการเดินทางกลับเอง และออกจากที่นั่นได้ทุกเมื่อหากรู้สึกไม่ปลอดภัย กรณีฉุกเฉินในประเทศไทยโทร 191 (ตำรวจ) หรือ 1155 (ตำรวจท่องเที่ยว)',
        ],
      },
      {
        heading: '3. กฎเกี่ยวกับเนื้อหาและพฤติกรรม',
        paragraphs: [
          'เราไม่ยอมรับเนื้อหาที่ไม่เหมาะสมและผู้ใช้ที่มีพฤติกรรมไม่ดีโดยเด็ดขาด ห้ามโพสต์ ส่ง หรือทำสิ่งใดที่:',
          '• คุกคาม ข่มขู่ กลั่นแกล้ง สะกดรอยตาม หรือเลือกปฏิบัติต่อผู้อื่น หรือแสดงความเกลียดชังหรือความรุนแรง',
          '• มีเนื้อหาทางเพศ ภาพเปลือย หรือลามกอนาจาร หรือเกี่ยวข้องกับผู้ที่อายุต่ำกว่า 18 ปี',
          '• เป็นสแปม หลอกลวง โฆษณาหรือขายของ หรือผิดกฎหมาย รวมถึงยาเสพติดและอาวุธ',
          '• แอบอ้างเป็นผู้อื่น หรือเผยแพร่ข้อมูลส่วนตัวหรือรูปภาพของผู้อื่นโดยไม่ได้รับอนุญาต',
          'คุณยังคงเป็นเจ้าของสิ่งที่คุณโพสต์ (ข้อความ รูปภาพ ข้อความเสียง และโปรไฟล์) และอนุญาตให้เราจัดเก็บและแสดงให้ผู้ที่คุณแชร์ด้วยเห็น เพื่อให้แอปทำงานได้',
        ],
      },
      {
        heading: '4. การบล็อก การรายงาน และการดูแลเนื้อหา',
        paragraphs: [
          'คุณสามารถบล็อกหรือรายงานผู้ใช้คนใดก็ได้จากโปรไฟล์ แชท หรือหน้านักเดินทาง การบล็อกจะซ่อนคุณทั้งสองจากกันและกัน',
          'เราตรวจสอบรายงาน และอาจลบเนื้อหา ระงับ หรือลบบัญชีที่ละเมิดข้อกำหนดนี้ได้โดยไม่ต้องแจ้งล่วงหน้า เราตั้งเป้าดำเนินการกับรายงานเนื้อหาที่ไม่เหมาะสมภายใน 24 ชั่วโมง',
        ],
      },
      {
        heading: '5. ร้านพาร์ทเนอร์ คูปอง และดีล',
        paragraphs: [
          'คูปองมาจากร้านพาร์ทเนอร์ ส่วนลดหรือข้อเสนอจะปลดล็อกเมื่อสมาชิกของโต๊ะอย่างน้อย 3 คนเช็กอินที่ร้านแล้วเท่านั้น (ส่วนลดตั๋ว 1 คน) QR โค้ดใช้ได้ครั้งเดียวและหมดอายุ 15 นาทีหลังจากแสดง มีเพียงพนักงานร้านเท่านั้นที่เห็นรหัสคูปอง',
          'ร้านเป็นผู้กำหนดข้อเสนอและอาจเปลี่ยนแปลงหรือยกเลิกได้ ร้านเป็นผู้รับผิดชอบอาหาร เครื่องดื่ม ตั๋ว ราคา และบริการของร้าน ไม่ใช่ TableMeet',
          'ห้ามใช้คูปองในทางที่ผิด เช่น เช็กอินปลอมหรือแชร์รหัส เราอาจยกเลิกคูปองและบัญชีที่ทำเช่นนั้น',
          'ดีลท่องเที่ยว หน้าขายตั๋ว เว็บไซต์จองที่พัก และเว็บไซต์อื่นที่เราลิงก์ไป ดำเนินการโดยผู้อื่นภายใต้ข้อกำหนดของเขาเอง',
        ],
      },
      {
        heading: '6. ตำแหน่งที่ตั้ง',
        paragraphs: [
          'แผนที่ การเช็กอิน และหน้านักเดินทางใช้ตำแหน่งของโทรศัพท์คุณ ตำแหน่งสดในแชทจะแชร์เมื่อคุณเริ่มแชร์เองเท่านั้น และเฉพาะขณะที่เปิดแอปอยู่ นโยบายความเป็นส่วนตัวอธิบายว่าเราเก็บข้อมูลอะไรบ้าง',
        ],
      },
      {
        heading: '7. บริการ',
        paragraphs: [
          'TableMeet ใช้งานได้ฟรี เราอาจเปลี่ยนแปลง หยุดชั่วคราว หรือยกเลิกฟีเจอร์ได้ทุกเมื่อ',
          'คุณลบบัญชีได้ทุกเมื่อที่ การตั้งค่า → ลบบัญชี เราอาจระงับหรือปิดบัญชีที่ละเมิดข้อกำหนดนี้หรือกฎหมาย',
        ],
      },
      {
        heading: '8. ความรับผิดชอบของเรา',
        paragraphs: [
          'TableMeet ให้บริการ "ตามสภาพ" เท่าที่กฎหมายอนุญาต เราไม่รับผิดชอบต่อการกระทำของผู้คนก่อน ระหว่าง หรือหลังการนัดพบ ต่อสินค้าและบริการของร้าน หรือต่อความเสียหายทางอ้อม',
          'ข้อกำหนดนี้ไม่จำกัดสิทธิ์ของคุณตามกฎหมายคุ้มครองผู้บริโภคของไทยที่ไม่อาจยกเว้นได้',
        ],
      },
      {
        heading: '9. กฎหมายและการเปลี่ยนแปลง',
        paragraphs: [
          'ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย และศาลไทยเป็นผู้พิจารณาข้อพิพาท',
          'เราอาจปรับปรุงข้อกำหนดนี้ วันที่ด้านบนแสดงฉบับล่าสุด และเราจะแจ้งในแอปเมื่อมีการเปลี่ยนแปลงที่สำคัญ การใช้ TableMeet ต่อหลังการเปลี่ยนแปลงถือว่าคุณยอมรับ',
        ],
      },
      {
        heading: '10. ติดต่อเรา',
        paragraphs: ['{contact}'],
      },
    ],
  },
};

const PRIVACY: Record<LegalLanguage, RawDoc> = {
  en: {
    title: 'Privacy Policy',
    intro: [
      'This policy explains what personal data TableMeet collects, why, who sees it and your rights. {operator} is the data controller. We follow Thailand\'s Personal Data Protection Act B.E. 2562 (PDPA).',
    ],
    sections: [
      {
        heading: '1. What we collect',
        paragraphs: [
          '• Account: your name, email address and account ID from Google sign-in (or Apple on iPhone), and your phone number if phone verification is on.',
          '• Profile: name, birthday (kept private; others only see your age), profile picture and photos, Instagram username, home country, languages, profession, travel style, interests, countries visited, trips and world clocks. Most of this is optional.',
          '• Activity: tables and hangouts you create or join, check-ins, coupons used, follows, the 👍 / 👎 you give (who gave what stays private), favourite places, day plans and notifications you have read.',
          '• Messages: chats, photos, voice notes and live locations you send.',
          '• Safety: people you block and reports you send.',
          '• Technical: your IP address and device information, which our service providers log when the app connects.',
        ],
      },
      {
        heading: '2. Location',
        paragraphs: [
          '• Map: your location is used on your phone to centre the map and show what is near you.',
          '• Check-in: when you tap Check in, your position is sent to our server to confirm you are within 50 m of the venue. We keep that you checked in and when, not your coordinates.',
          '• Travellers: only if you turn on "Show me to travellers nearby". We keep your latest location for up to 2 hours. Others see a dot moved 150–400 m away and a rounded distance, never your exact position. Turning it off deletes your location.',
          '• Live location in a chat: only when you start it, updated only while the app is open, and it stops at the time you chose.',
          'We never track your location in the background.',
        ],
      },
      {
        heading: '3. How we use your data',
        paragraphs: [
          'To run TableMeet (accounts, tables, hangouts, chats, the map), show your profile to other users, unlock coupons and settle with partner venues, keep people safe (reports, blocks, moderation), prevent misuse, and meet legal duties.',
          'Our legal bases are: providing the service you asked for (contract), our legitimate interests (safety, preventing misuse, improving the app), your consent (location features, Travellers, live location, optional profile details) and legal obligations. You can withdraw consent at any time in the app.',
          'We do not sell your data and we do not show ads.',
        ],
      },
      {
        heading: '4. Who can see your data',
        paragraphs: [
          '• Other users: your profile (age, not your birthday), what you post in chats to the people in them, and the tables and hangouts you join.',
          '• Partner venue staff: only the coupon page and how many people are checked in.',
          '• Service providers that run TableMeet for us: Supabase (database, files and sign-in; servers in Singapore), Google (sign-in), Apple (sign-in on iPhone), OpenFreeMap (map tiles: receives your IP address when the map loads), Photon by komoot (place search: receives what you type), Wikimedia Commons (place photos) and Vercel (our website).',
          '• Other websites only if you open their links (for example travel deals or ticket pages).',
          '• Authorities, when the law requires it.',
        ],
      },
      {
        heading: '5. Where your data is stored',
        paragraphs: [
          'Your data is stored on servers in Singapore. Some service providers may process data in other countries; we use providers that protect personal data to standards required by the PDPA.',
        ],
      },
      {
        heading: '6. How long we keep it',
        paragraphs: [
          'We keep your data while your account exists. Travellers locations are kept for up to 2 hours, and unsent messages are removed straight away.',
          'Coupon records (venue, time, staff login and the names of the people checked in) are kept for up to 5 years for accounting with venues, also after an account is deleted.',
        ],
      },
      {
        heading: '7. Deleting your account',
        paragraphs: [
          'Delete your account at any time in Settings → Delete account. This deletes your sign-in, profile, photos, the messages and files you sent, trips, favourites, day plans and follows. Tables and hangouts you hosted that other people joined stay for them, with another member as host.',
          'You can also read how to request deletion at {deleteUrl}.',
        ],
      },
      {
        heading: '8. Your rights',
        paragraphs: [
          'Under the PDPA you can ask to access or get a copy of your data, correct it, delete it, object to or restrict its use, move it to another service, and withdraw consent. You can change most of your data yourself in the app. You can also complain to Thailand\'s Personal Data Protection Committee (PDPC).',
        ],
      },
      {
        heading: '9. Children',
        paragraphs: ['TableMeet is only for people aged 18 or older. We delete accounts we learn belong to someone younger.'],
      },
      {
        heading: '10. Security',
        paragraphs: [
          'Data is encrypted in transit, and access rules in our database decide who can read what. Chat photos and voice notes are private and opened only through links that expire. No system is perfectly secure, so please keep your account safe too.',
        ],
      },
      {
        heading: '11. Changes and contact',
        paragraphs: [
          'We may update this policy. The date at the top shows the latest version, and we will tell you in the app about important changes.',
          '{contact}',
        ],
      },
    ],
  },
  th: {
    title: 'นโยบายความเป็นส่วนตัว',
    intro: [
      'นโยบายนี้อธิบายว่า TableMeet เก็บข้อมูลส่วนบุคคลอะไร เพื่ออะไร ใครเห็นได้ และสิทธิ์ของคุณ {operator} เป็นผู้ควบคุมข้อมูลส่วนบุคคล เราปฏิบัติตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)',
    ],
    sections: [
      {
        heading: '1. ข้อมูลที่เราเก็บ',
        paragraphs: [
          '• บัญชี: ชื่อ อีเมล และรหัสบัญชีจากการเข้าสู่ระบบด้วย Google (หรือ Apple บน iPhone) และหมายเลขโทรศัพท์หากเปิดการยืนยันเบอร์โทร',
          '• โปรไฟล์: ชื่อ วันเกิด (เก็บเป็นความลับ ผู้อื่นเห็นเพียงอายุ) รูปโปรไฟล์และรูปภาพ ชื่อผู้ใช้ Instagram ประเทศ ภาษา อาชีพ สไตล์การเที่ยว ความสนใจ ประเทศที่เคยไป ทริป และนาฬิกาโลก ส่วนใหญ่ไม่บังคับ',
          '• กิจกรรม: โต๊ะและแฮงเอาท์ที่คุณสร้างหรือเข้าร่วม การเช็กอิน คูปองที่ใช้ การติดตาม 👍 / 👎 ที่คุณให้ (ใครให้อะไรเป็นความลับ) สถานที่โปรด แผนเที่ยว และการแจ้งเตือนที่อ่านแล้ว',
          '• ข้อความ: แชท รูปภาพ ข้อความเสียง และตำแหน่งสดที่คุณส่ง',
          '• ความปลอดภัย: ผู้ที่คุณบล็อกและรายงานที่คุณส่ง',
          '• ข้อมูลทางเทคนิค: ที่อยู่ IP และข้อมูลอุปกรณ์ ซึ่งผู้ให้บริการของเราบันทึกเมื่อแอปเชื่อมต่อ',
        ],
      },
      {
        heading: '2. ตำแหน่งที่ตั้ง',
        paragraphs: [
          '• แผนที่: ใช้ตำแหน่งของคุณบนโทรศัพท์เพื่อแสดงแผนที่รอบตัวคุณและสิ่งที่อยู่ใกล้',
          '• เช็กอิน: เมื่อคุณกดเช็กอิน ตำแหน่งจะถูกส่งไปยังเซิร์ฟเวอร์เพื่อยืนยันว่าคุณอยู่ภายใน 50 เมตรจากร้าน เราเก็บเพียงว่าคุณเช็กอินแล้วและเวลาใด ไม่เก็บพิกัดของคุณ',
          '• นักเดินทาง: เฉพาะเมื่อคุณเปิด "แสดงฉันให้นักเดินทางใกล้ๆ เห็น" เราเก็บตำแหน่งล่าสุดของคุณไม่เกิน 2 ชั่วโมง ผู้อื่นเห็นจุดที่ถูกขยับไป 150–400 เมตรและระยะทางแบบปัดเศษ ไม่เห็นตำแหน่งจริงของคุณ การปิดจะลบตำแหน่งของคุณ',
          '• ตำแหน่งสดในแชท: เฉพาะเมื่อคุณเริ่มแชร์ อัปเดตเฉพาะขณะเปิดแอป และหยุดตามเวลาที่คุณเลือก',
          'เราไม่ติดตามตำแหน่งของคุณเบื้องหลัง',
        ],
      },
      {
        heading: '3. เราใช้ข้อมูลของคุณอย่างไร',
        paragraphs: [
          'เพื่อให้บริการ TableMeet (บัญชี โต๊ะ แฮงเอาท์ แชท แผนที่) แสดงโปรไฟล์ของคุณให้ผู้ใช้อื่น ปลดล็อกคูปองและชำระบัญชีกับร้านพาร์ทเนอร์ ดูแลความปลอดภัย (รายงาน การบล็อก การดูแลเนื้อหา) ป้องกันการใช้งานในทางที่ผิด และปฏิบัติตามกฎหมาย',
          'ฐานทางกฎหมายของเราคือ การให้บริการที่คุณขอ (สัญญา) ประโยชน์โดยชอบด้วยกฎหมาย (ความปลอดภัย ป้องกันการใช้ในทางที่ผิด และปรับปรุงแอป) ความยินยอมของคุณ (ฟีเจอร์ตำแหน่ง นักเดินทาง ตำแหน่งสด และข้อมูลโปรไฟล์ที่ไม่บังคับ) และหน้าที่ตามกฎหมาย คุณถอนความยินยอมได้ทุกเมื่อในแอป',
          'เราไม่ขายข้อมูลของคุณและไม่แสดงโฆษณา',
        ],
      },
      {
        heading: '4. ใครเห็นข้อมูลของคุณได้',
        paragraphs: [
          '• ผู้ใช้อื่น: โปรไฟล์ของคุณ (อายุ ไม่ใช่วันเกิด) สิ่งที่คุณโพสต์ในแชทสำหรับคนในแชทนั้น และโต๊ะหรือแฮงเอาท์ที่คุณเข้าร่วม',
          '• พนักงานร้านพาร์ทเนอร์: เห็นเพียงหน้าคูปองและจำนวนคนที่เช็กอิน',
          '• ผู้ให้บริการที่ช่วยเราให้บริการ TableMeet: Supabase (ฐานข้อมูล ไฟล์ และการเข้าสู่ระบบ เซิร์ฟเวอร์ที่สิงคโปร์) Google (การเข้าสู่ระบบ) Apple (การเข้าสู่ระบบบน iPhone) OpenFreeMap (ภาพแผนที่ ได้รับที่อยู่ IP ของคุณเมื่อโหลดแผนที่) Photon โดย komoot (ค้นหาสถานที่ ได้รับคำที่คุณพิมพ์) Wikimedia Commons (รูปสถานที่) และ Vercel (เว็บไซต์ของเรา)',
          '• เว็บไซต์อื่น เฉพาะเมื่อคุณเปิดลิงก์ของเขา (เช่น ดีลท่องเที่ยวหรือหน้าขายตั๋ว)',
          '• หน่วยงานรัฐ เมื่อกฎหมายกำหนด',
        ],
      },
      {
        heading: '5. ที่เก็บข้อมูล',
        paragraphs: [
          'ข้อมูลของคุณเก็บบนเซิร์ฟเวอร์ในสิงคโปร์ ผู้ให้บริการบางรายอาจประมวลผลข้อมูลในประเทศอื่น เราเลือกใช้ผู้ให้บริการที่คุ้มครองข้อมูลส่วนบุคคลตามมาตรฐานที่ PDPA กำหนด',
        ],
      },
      {
        heading: '6. ระยะเวลาการเก็บข้อมูล',
        paragraphs: [
          'เราเก็บข้อมูลของคุณตราบเท่าที่บัญชียังอยู่ ตำแหน่งในหน้านักเดินทางเก็บไม่เกิน 2 ชั่วโมง และข้อความที่ยกเลิกการส่งจะถูกลบทันที',
          'บันทึกการใช้คูปอง (ร้าน เวลา บัญชีพนักงาน และชื่อของผู้ที่เช็กอิน) เก็บไว้ไม่เกิน 5 ปีเพื่อการบัญชีกับร้าน แม้บัญชีจะถูกลบแล้ว',
        ],
      },
      {
        heading: '7. การลบบัญชี',
        paragraphs: [
          'ลบบัญชีได้ทุกเมื่อที่ การตั้งค่า → ลบบัญชี ระบบจะลบการเข้าสู่ระบบ โปรไฟล์ รูปภาพ ข้อความและไฟล์ที่คุณส่ง ทริป สถานที่โปรด แผนเที่ยว และการติดตามของคุณ โต๊ะและแฮงเอาท์ที่คุณเป็นเจ้าภาพซึ่งมีผู้อื่นเข้าร่วมจะยังอยู่สำหรับพวกเขา โดยมีสมาชิกอีกคนเป็นเจ้าภาพแทน',
          'คุณยังอ่านวิธีขอลบบัญชีได้ที่ {deleteUrl}',
        ],
      },
      {
        heading: '8. สิทธิ์ของคุณ',
        paragraphs: [
          'ตาม PDPA คุณมีสิทธิ์ขอเข้าถึงหรือขอสำเนาข้อมูล แก้ไข ลบ คัดค้านหรือจำกัดการใช้ ขอโอนย้ายข้อมูล และถอนความยินยอม ข้อมูลส่วนใหญ่คุณแก้ไขเองได้ในแอป คุณยังร้องเรียนต่อคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.) ได้',
        ],
      },
      {
        heading: '9. ผู้เยาว์',
        paragraphs: ['TableMeet สำหรับผู้ที่มีอายุ 18 ปีขึ้นไปเท่านั้น หากเราทราบว่าบัญชีใดเป็นของผู้ที่อายุน้อยกว่านั้น เราจะลบบัญชีนั้น'],
      },
      {
        heading: '10. ความปลอดภัย',
        paragraphs: [
          'ข้อมูลถูกเข้ารหัสระหว่างการส่ง และกฎการเข้าถึงในฐานข้อมูลกำหนดว่าใครอ่านอะไรได้ รูปภาพและข้อความเสียงในแชทเป็นส่วนตัวและเปิดได้ผ่านลิงก์ที่หมดอายุเท่านั้น ไม่มีระบบใดปลอดภัยสมบูรณ์ โปรดช่วยดูแลบัญชีของคุณด้วย',
        ],
      },
      {
        heading: '11. การเปลี่ยนแปลงและการติดต่อ',
        paragraphs: [
          'เราอาจปรับปรุงนโยบายนี้ วันที่ด้านบนแสดงฉบับล่าสุด และเราจะแจ้งในแอปเมื่อมีการเปลี่ยนแปลงที่สำคัญ',
          '{contact}',
        ],
      },
    ],
  },
};

const FALLBACK = {
  operator: { en: 'the TableMeet team', th: 'ทีมงาน TableMeet' },
  contact: {
    en: 'Questions or requests about these terms or your data: contact us through the developer contact on TableMeet\'s Google Play page.',
    th: 'หากมีคำถามหรือคำขอเกี่ยวกับข้อกำหนดหรือข้อมูลของคุณ ติดต่อเราผ่านช่องทางติดต่อผู้พัฒนาในหน้า Google Play ของ TableMeet',
  },
  email: {
    en: 'Questions or requests about these terms or your data: email {email}.',
    th: 'หากมีคำถามหรือคำขอเกี่ยวกับข้อกำหนดหรือข้อมูลของคุณ อีเมลถึง {email}',
  },
};

// The document in one language with the founder's details filled in. Paragraphs that need a missing detail (the
// deletion page without a website address) are left out.
export function legalDoc(id: LegalDocId, language: LegalLanguage, contact: LegalContact): LegalDoc {
  const raw = (id === 'terms' ? TERMS : PRIVACY)[language];
  const operator = contact.operator?.trim() || FALLBACK.operator[language];
  const email = contact.email?.trim();
  const contactLine = email ? FALLBACK.email[language].replace('{email}', email) : FALLBACK.contact[language];
  const webUrl = contact.webUrl?.trim().replace(/\/+$/, '');
  const fill = (text: string) =>
    text
      .replaceAll('{operator}', operator)
      .replaceAll('{contact}', contactLine)
      .replaceAll('{deleteUrl}', webUrl ? `${webUrl}/delete-account` : '');
  const keep = (text: string) => !text.includes('{deleteUrl}') || Boolean(webUrl);

  return {
    title: raw.title,
    updated: UPDATED[language],
    intro: raw.intro.filter(keep).map(fill),
    sections: raw.sections.map((section) => ({
      heading: section.heading,
      paragraphs: section.paragraphs.filter(keep).map(fill),
    })),
  };
}
