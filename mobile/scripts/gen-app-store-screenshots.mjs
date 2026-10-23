// App Store screenshots (iPhone 6.9", 1320 x 2868) from the phone captures in store-screenshots/: a headline in the
// app's fonts on the dark brand background above the capture. Writes app-store/screenshots/<lang>/*.png.
// Thai screenshots use only captures of the app in Thai (store-screenshots/th/<name>.png, any 1:2 portrait capture);
// missing ones are listed and left out, so English screens never sit under Thai headlines.
// No screens with partner discounts while coupons are switched off (COUPONS_ENABLED in src/lib/coupons.ts).
// Run from mobile/: node scripts/gen-app-store-screenshots.mjs   (needs web/node_modules for sharp)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const sharp = createRequire(path.join(root, 'web', 'package.json'))('sharp');

const W = 1320;
const H = 2868;
const fonts = path.join(root, 'mobile', 'assets', 'fonts');
const HEAD_FONT = { file: path.join(fonts, 'BricolageGrotesque_800ExtraBold.ttf'), name: 'Bricolage Grotesque ExtraBold' };
const SUB_FONT = { file: path.join(fonts, 'Figtree_600SemiBold.ttf'), name: 'Figtree SemiBold' };
const THAI_HEAD = { file: path.join(fonts, 'Anuphan_700Bold.ttf'), name: 'Anuphan Bold' };
const THAI_SUB = { file: path.join(fonts, 'Anuphan_500Medium.ttf'), name: 'Anuphan Medium' };

// Capture, headline, line under it. Plus features say so (Apple: paid / locked features must be marked).
const SHOTS = {
  en: [
    ['01-home-map', 'Never eat alone\nin Bangkok', 'Join open tables and hangouts near you'],
    ['04-table-checkin', 'Meet up\nand check in', 'Earn points and rewards for real meetups'],
    ['07-hangout-map', 'Hangouts\nanywhere', 'Walks, temples, markets and events'],
    ['05-plan-my-day', 'Plan your\nperfect day', 'TableMeet Plus · free at level 15'],
    ['06-hidden-gems', "Bangkok's\nhidden gems", 'TableMeet Plus · free at level 15'],
    ['08-home-thai', 'ภาษาไทย\n& English', 'Use TableMeet in Thai or English'],
  ],
  th: [
    ['08-home-thai', 'ไม่ต้องกินข้าว\nคนเดียวอีกต่อไป', 'เข้าร่วมโต๊ะและแฮงเอาท์ใกล้คุณ'],
    ['th/01-pick-place', 'เลือกร้าน\nที่อยากไป', 'คาเฟ่ ร้านอาหาร และบาร์นับพันแห่งในกรุงเทพฯ'],
    ['th/02-create-table', 'สร้างโต๊ะ\nได้ในไม่กี่วินาที', 'เลือกวัน เวลา และจำนวนคน'],
    ['th/07-hangout-map', 'แฮงเอาท์\nได้ทุกที่', 'เดินเล่น วัด ตลาด และอีเวนต์'],
    ['th/05-plan-my-day', 'วางแผน\nวันที่ลงตัว', 'TableMeet Plus · ฟรีเมื่อถึงเลเวล 15'],
    ['th/06-hidden-gems', 'ร้านลับ\nในกรุงเทพฯ', 'TableMeet Plus · ฟรีเมื่อถึงเลเวล 15'],
  ],
};

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isThai = (text) => /[฀-๿]/.test(text);

async function textImage(text, font, size, color, width) {
  const markup = `<span foreground="${color}">${escape(text)}</span>`;
  return sharp({
    text: { text: markup, font: `${font.name} ${size}`, fontfile: font.file, width, align: 'centre', rgba: true, dpi: 72, spacing: Math.round(size * 0.12) },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="a" cx="15%" cy="0%" r="70%"><stop offset="0" stop-color="#FE593B" stop-opacity="0.55"/><stop offset="1" stop-color="#FE593B" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="95%" cy="12%" r="65%"><stop offset="0" stop-color="#7C4DFF" stop-opacity="0.6"/><stop offset="1" stop-color="#7C4DFF" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#0A0612"/><rect width="100%" height="100%" fill="url(#a)"/><rect width="100%" height="100%" fill="url(#b)"/>
</svg>`);

async function make(lang, [file, headline, sub], index) {
  const SHOT_W = 1120;
  const SHOT_H = Math.round((SHOT_W * 2160) / 1080);
  const RADIUS = 64;
  const top = H - SHOT_H - 40;
  // iPhone captures are a little taller than 1:2: keep the top, trim the bottom edge.
  const capture = await sharp(path.join(root, 'store-screenshots', `${file}.png`))
    .resize(SHOT_W, SHOT_H, { fit: 'cover', position: 'top' })
    .toBuffer();
  const mask = Buffer.from(`<svg width="${SHOT_W}" height="${SHOT_H}"><rect width="${SHOT_W}" height="${SHOT_H}" rx="${RADIUS}" fill="#fff"/></svg>`);
  const rounded = await sharp(capture).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const frame = Buffer.from(`<svg width="${SHOT_W + 16}" height="${SHOT_H + 16}"><rect x="1" y="1" width="${SHOT_W + 14}" height="${SHOT_H + 14}" rx="${RADIUS + 8}" fill="#1E1630" stroke="#3A2D55" stroke-width="2"/></svg>`);

  const thaiHead = isThai(headline);
  const head = await textImage(headline, thaiHead ? THAI_HEAD : HEAD_FONT, thaiHead ? 104 : 112, '#FFFFFF', W - 160);
  const subImg = await textImage(sub, isThai(sub) ? THAI_SUB : SUB_FONT, 50, '#FFB59E', W - 160);
  const space = top - 40;
  const block = head.info.height + 36 + subImg.info.height;
  const headTop = Math.max(70, Math.round((space - block) / 2) + 20);

  const name = path.basename(file).replace(/^\d+-/, '');
  const out = path.join(root, 'app-store', 'screenshots', lang, `${String(index + 1).padStart(2, '0')}-${name}.png`);
  const composed = await sharp(background)
    .composite([
      { input: head.data, top: headTop, left: Math.round((W - head.info.width) / 2) },
      { input: subImg.data, top: headTop + head.info.height + 36, left: Math.round((W - subImg.info.width) / 2) },
      { input: frame, top: top - 8, left: Math.round((W - SHOT_W) / 2) - 8 },
      { input: rounded, top, left: Math.round((W - SHOT_W) / 2) },
    ])
    .png()
    .toBuffer();
  // App Store Connect wants screenshots without an alpha channel.
  await sharp(composed).flatten({ background: '#0A0612' }).removeAlpha().png().toFile(out);
  console.log('wrote', path.relative(root, out));
}

for (const [lang, all] of Object.entries(SHOTS)) {
  const folder = path.join(root, 'app-store', 'screenshots', lang);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const shots = all.filter(([file]) => {
    const found = fs.existsSync(path.join(root, 'store-screenshots', `${file}.png`));
    if (!found) console.log(`missing store-screenshots/${file}.png (left out of ${lang})`);
    return found;
  });
  for (const [i, shot] of shots.entries()) await make(lang, shot, i);
}
