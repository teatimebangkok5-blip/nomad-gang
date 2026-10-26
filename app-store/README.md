# App Store kit

Everything to paste into App Store Connect for the first iPhone release. Build and upload steps are in the main
`README.md` (section "iPhone / App Store").

| File | Where it goes in App Store Connect |
|---|---|
| `app-icon-1024.png` | Not uploaded by hand: it's built into the app (`mobile/assets/images/icon.png`, 1024 × 1024, no transparency). Kept here for reference. |
| `screenshots/en/*.png` | App Store → iOS app → **English** → iPhone 6.9" Display (1320 × 2868). Upload in number order. Apple scales them down for smaller iPhones. |
| `screenshots/th/*.png` | Same, under the **Thai** localization. |
| `screenshots/en-medium/*.png`, `th-medium/*.png` | The same pictures at 1206 × 2622 for **iPhone with Dynamic Island (medium display)** (6.1" / 6.3"), if App Store Connect asks for that size. |
| `header/header-3840x1646.png` | Version page → Product Page Information → **Header** (21:9). No text, so the same file for English and Thai. Shown on iOS 27+ only; optional. |
| `header/search-results-<lang>-3840x2560.png` | Same section → **Search Results** (3:2), `en` under English, `th` under Thai. |

The header and search results images are made by `node mobile/scripts/gen-app-store-header.mjs` from the same
captures. Apple doesn't allow prices, discounts, URLs or logos in them, so the create-table screen (it shows a partner
discount) is left out.

The screenshots are made from the phone captures in `store-screenshots/` by
`node mobile/scripts/gen-app-store-screenshots.mjs` (headlines are in that script). Each capture is drawn in an iPhone
frame with the Dynamic Island and an iOS status bar (9:41); the captures come from Android without system bars, so the
status bar strip is a blur of the capture's top edge and nothing in the app is covered. Screens showing partner discounts
are left out while coupons are switched off for launch.

**Thai set**: made only from captures of the app in Thai (`store-screenshots/th/`, taken on the Redmi on 2026-10-23 in
the Light theme with the system bars cropped off): home, pick a place, create a table, hangout map, Plan my day, Hidden
Gems. No chat or table screens: the existing ones show other people's names, which shouldn't go into store screenshots
without their permission. To replace a capture, save a new one with the same name and run the script again.

Any portrait capture works (the script fits it). If a Thai localization has no screenshots of its own, the App Store
shows the English ones. No iPad screenshots are needed (`supportsTablet` is false).

---

## App information

- **Name** (30 max): `TableMeet` (if it's taken: `TableMeet: Eat & Meet`)
- **Subtitle** (30 max): EN `Social dining in Bangkok` · TH `หาเพื่อนกินข้าวในกรุงเทพฯ`
- **Bundle ID**: `com.tablemeet.app`
- **SKU**: `tablemeet-ios`
- **Primary category**: Social Networking · **Secondary**: Food & Drink
- **Content rights**: No third-party content you don't have rights to (maps are OpenStreetMap, credit shown in the app).
- **Age rating**: answer the questionnaire honestly. Users chat with strangers and post photos (user-generated content,
  messaging), and the app only allows people 18+ (birthday check), so pick **18+**.
- **Privacy Policy URL**: `https://sites.google.com/view/tablemeet/home` (must open the policy; a page that links to it
  is OK)
- **Support URL**: the same Google Site, or a page with `tablemeet.helpdesk@gmail.com`
- **Copyright**: `2026 TableMeet` (plain text, not a URL; Apple adds the ©)
- **Marketing URL** (optional): `https://sites.google.com/view/tablemeet/home`, or leave empty
- **Routing App Coverage File**: leave empty. Only for apps that give turn-by-turn directions
  (`MKDirectionsApplicationSupportedModes`); TableMeet only opens Apple Maps.

## Promotional text (170 max)

EN: `Find people to eat, drink and explore with in Bangkok. Join a table tonight or start your own in seconds.`

TH: `หาเพื่อนกิน ดื่ม และเที่ยวในกรุงเทพฯ เข้าร่วมโต๊ะคืนนี้ หรือสร้างโต๊ะของคุณเองได้ในไม่กี่วินาที`

## Keywords (100 max, commas, no spaces)

EN: `bangkok,dining,meetup,travel,nomad,expat,friends,food,hangout,solo,traveller,restaurant,cafe,bar`

TH: `กรุงเทพ,กินข้าว,เพื่อนใหม่,นัดเจอ,ท่องเที่ยว,ร้านอาหาร,คาเฟ่,บาร์,แฮงเอาท์,อีเวนต์,นักเดินทาง`

## Description (EN)

```
Never eat alone in Bangkok.

TableMeet helps travellers, digital nomads, expats and locals find each other and meet up over food and drinks.
Open the map, see who's going out tonight, and join a table, or start your own in a few taps.

FIND A TABLE
• See open tables and hangouts on a live map of Bangkok
• Filter by Today, Tonight, Food, Drinks, Explore or Budget-friendly
• Every table shows the place, time, cost and who's going

START YOUR OWN
• Pick from thousands of cafés, restaurants, rooftops and bars
• Choose the day, time and group size: open to everyone or private
• Hangouts and events work anywhere in the world: park walks, markets, museums, concerts

MEET PEOPLE
• Group chat for every table, plus private messages and group chats
• Photos, voice notes, live location, icebreaker cards and a bill splitter
• Profiles with Instagram, languages, interests and trips
• See travellers nearby (only if they choose to be visible, and never their exact location)

STAY SAFE
• Block and report anyone, at any time
• Verified badges and women-only tables for verified women
• Your exact location is never shown to other people

EARN AS YOU GO
• Check in when you arrive, earn points and level up
• Reach level 15 to unlock TableMeet Plus for free: Plan my day, Hidden Gems and the Rewards Passport

Available in English and Thai.
```

## Description (TH)

```
ไม่ต้องกินข้าวคนเดียวในกรุงเทพฯ อีกต่อไป

TableMeet ช่วยให้นักเดินทาง ดิจิทัลโนแมด ชาวต่างชาติ และคนในพื้นที่ได้พบกันและนัดกินดื่มด้วยกัน
เปิดแผนที่ ดูว่าใครจะออกไปคืนนี้ แล้วเข้าร่วมโต๊ะ หรือสร้างโต๊ะของคุณเองได้ในไม่กี่แตะ

หาโต๊ะ
• ดูโต๊ะและแฮงเอาท์ที่เปิดอยู่บนแผนที่สดของกรุงเทพฯ
• กรองตาม วันนี้ คืนนี้ อาหาร เครื่องดื่ม เที่ยว หรือราคาประหยัด
• ทุกโต๊ะบอกสถานที่ เวลา ค่าใช้จ่าย และใครจะไปบ้าง

สร้างโต๊ะเอง
• เลือกจากคาเฟ่ ร้านอาหาร รูฟท็อป และบาร์นับพันแห่ง
• เลือกวัน เวลา และจำนวนคน เปิดให้ทุกคนหรือแบบส่วนตัว
• แฮงเอาท์และอีเวนต์สร้างได้ทุกที่ทั่วโลก

พบผู้คน
• แชทกลุ่มของทุกโต๊ะ ข้อความส่วนตัว และกลุ่มแชท
• รูป ข้อความเสียง ตำแหน่งสด การ์ดทำความรู้จัก และเครื่องคิดเงินหารบิล
• โปรไฟล์พร้อม Instagram ภาษา ความสนใจ และทริป
• ดูนักเดินทางใกล้ ๆ (เฉพาะคนที่เลือกแสดงตัว และไม่แสดงตำแหน่งจริง)

ปลอดภัย
• บล็อกและรายงานใครก็ได้ทุกเมื่อ
• ป้ายยืนยันตัวตน และโต๊ะเฉพาะผู้หญิงที่ยืนยันตัวตนแล้ว
• ไม่มีใครเห็นตำแหน่งจริงของคุณ

สะสมแต้ม
• เช็กอินเมื่อไปถึง รับแต้ม และเลื่อนเลเวล
• ถึงเลเวล 15 ปลดล็อก TableMeet Plus ฟรี: วางแผนเที่ยว ร้านลับ และ Rewards Passport

ใช้งานได้ทั้งภาษาไทยและภาษาอังกฤษ
```

## App Review notes (App Review Information → Notes)

**Use `review-info.md` now**: Apple asked for more information on the first submission (Guideline 2.1, 2026-10-26),
and that file has the full answer for the Notes field plus how to record the demo video. The short version below is
the original.

```
TableMeet is a social dining app for Bangkok, Thailand. Sign in with "Sign in with Apple" (or Google). On first start
you enter a name and a birthday (18+ only); the other questions can be skipped.

The app's content is in Bangkok, so from outside Thailand the home map opens on central Bangkok. You can browse open
tables, open a table (tap a pin, then the card), join it and use its group chat, create a table at any restaurant on
the map, and create a hangout anywhere in the world (Create hangout → tap the map).

Safety: every profile and chat has a ⋮ menu with Block and Report. Reports go to the founder's admin panel.
Account deletion: Settings → Delete account.
Location is only used while the app is open. "Show me to travellers nearby" is off until the user turns it on, and
other people only ever see a rough spot (moved 150–400 m), never the exact location.
TableMeet Plus can't be bought in the iPhone app; it's unlocked for free by reaching level 15.
```

Leave "Sign-in required" demo account empty if the reviewer can use Sign in with Apple; if Apple asks for one, create a
Google account for them and add it here.

## App Privacy (the "nutrition label")

Tracking: **No** (there are no ads or ad SDKs in the iPhone app). For each type below choose **Linked to the user**,
**not used for tracking**, purpose **App Functionality** (plus **Product Personalization** where noted).

| Data type | Why |
|---|---|
| Contact Info → Name, Email Address, Phone Number | Account, profile; phone only once SMS check is on |
| Location → Precise Location | Check-in at a place (50 m), live location in chats |
| Location → Coarse Location | Travellers nearby (opt-in), nearby tables, push for new tables nearby (rounded to ~5 km) |
| User Content → Photos or Videos | Profile pictures, chat photos, stories, event photos, verification selfie + ID (deleted after the decision) |
| User Content → Audio Data | Voice notes in chats |
| User Content → Other User Content | Messages, tips, trips, reviews (👍 / 👎) |
| Identifiers → User ID | Account ID |
| Identifiers → Device ID | Push notification token |
| Other Data | Birthday (age check), gender (only for verification, never shown) |

Not collected: health, financial info, browsing history, search history (searches aren't stored), purchases,
diagnostics, contacts.
