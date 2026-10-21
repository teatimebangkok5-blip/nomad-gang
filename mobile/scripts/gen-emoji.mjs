// Renders the TableMeet chat emoji from their vector source (scripts/emoji/tm-emoji.js, the founder's pack) into
//   assets/emoji/still/<id>.png   120 px still frame (inline in text, reactions, the picker)
//   assets/emoji/anim/<id>.webp   176 px animated WebP with transparency (big emoji-only messages; one file for both themes)
// and writes src/lib/tm-emoji-data.ts. Do not edit the generated files by hand.
// Needs sharp, borrowed from the web app: run `npm install` in web/ first, then (from mobile/):
//   node scripts/gen-emoji.mjs
// Greeting words are drawn with the app's Figtree ExtraBold (the SVG renderer can't load it or honour textLength).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(join(root, '..', 'web', 'package.json'))('sharp');
const FONT = join(root, 'assets', 'fonts', 'Figtree_800ExtraBold.ttf');

const STILL_PX = 120;
const ANIM_PX = 176;
const FPS = 15;

// The emoji character each one stands for. Messages store the character, so notifications, the inbox and other
// apps read normally; the chat draws the TableMeet picture instead. Greetings have none: they are sent as
// ":tm_<id>:" stickers. Characters that need it carry U+FE0F (emoji presentation).
const CHARS = {
  happy: '😃', lol: '😂', love: '😍', sad: '😢', wow: '😮', angry: '😠', wink: '😉', yum: '😋',
  cool: '😎', sleepy: '😴', party: '🥳', shy: '🥺', thinking: '🤔', starstruck: '🤩', oops: '😅', kiss: '😘',
  thumbs: '👍', clap: '👏', fire: '🔥', hundred: '💯', ok: '🆗', heart: '❤️', wavehand: '👋', sparkles: '✨',
  yay: '🎉', check: '✅', question: '❓', eyes: '👀',
  noodles: '🍜', beer: '🍺', coffee: '☕', pizza: '🍕', cocktail: '🍸', dumpling: '🥟', sushi: '🍣', taco: '🌮',
  icecream: '🍦', boba: '🧋', burger: '🍔', wine: '🍷',
  plane: '✈️', backpack: '🎒', mappin: '📍', passport: '🛂', suitcase: '🧳', globe: '🌏', camera: '📷', sun: '☀️',
  tuktuk: '🛺', ticket: '🎟️', palm: '🏝️', compass: '🧭',
  cheers: '🍻', table: '🍽️', seeyou: '🙋', omw: '🏃', checkin: '☑️', friends: '🫂', dance: '💃', highfive: '🙌',
  selfie: '🤳', splitbill: '🧾', calendar: '📅', group: '👥',
};

const win = {};
new Function('window', readFileSync(join(root, 'scripts', 'emoji', 'tm-emoji.js'), 'utf8'))(win);
const api = win.TMEmoji;

// --- Greeting words -------------------------------------------------------------------------------------------
const textCache = new Map();
async function renderText(markup) {
  if (!textCache.has(markup)) {
    const { data, info } = await sharp({ text: { text: markup, font: 'Figtree ExtraBold 100', fontfile: FONT, dpi: 72, rgba: true } })
      .png()
      .toBuffer({ resolveWithObject: true });
    textCache.set(markup, { data, width: info.width, height: info.height });
  }
  return textCache.get(markup);
}

// A word at a 100 px em, cropped to its ink sideways and to a fixed line box (top of "Ĥ" to the bottom of "g")
// vertically, so every word sits on the same baseline. Returns the PNG and where the baseline is.
async function wordImage(word, color) {
  const key = `${word}|${color}`;
  if (textCache.has(key)) return textCache.get(key);
  const strut = await renderText('<span>Ĥ</span>');
  const alone = await renderText(`<span foreground="${color}">${word}</span>`);
  const both = await renderText(`<span fgalpha="1">Ĥg</span><span foreground="${color}">${word}</span>`);
  const png = await sharp(both.data)
    .extract({ left: both.width - alone.width, top: 0, width: alone.width, height: both.height })
    .png()
    .toBuffer();
  const result = { png: png.toString('base64'), width: alone.width, height: both.height, baseline: strut.height };
  textCache.set(key, result);
  return result;
}

// Swaps each greeting <text> for an <image> of the word, stretched to its textLength like the browser would.
async function withWordImages(svg) {
  const re = /<text x="64" y="([\d.]+)" ([^>]*?)fill="([^"]+)"(?: opacity="([^"]+)")?>([^<]+)<\/text>/g;
  const parts = [];
  let last = 0;
  for (const m of svg.matchAll(re)) {
    const [whole, y, attrs, fill, opacity, word] = m;
    const size = Number(/font-size="([\d.]+)"/.exec(attrs)[1]);
    const length = Number(/textLength="([\d.]+)"/.exec(attrs)[1]);
    const color = fill === '#fff' ? '#ffffff' : fill;
    const img = await wordImage(word, color);
    const k = size / 100;
    const height = img.height * k;
    const top = Number(y) - img.baseline * k;
    parts.push(svg.slice(last, m.index));
    parts.push(
      `<image x="${64 - length / 2}" y="${top}" width="${length}" height="${height}" preserveAspectRatio="none"` +
        `${opacity ? ` opacity="${opacity}"` : ''} href="data:image/png;base64,${img.png}"/>`,
    );
    last = m.index + whole.length;
  }
  parts.push(svg.slice(last));
  return parts.join('');
}

async function frame(id, t, px) {
  let svg = api.svg(id, t, 'e_', px);
  if (svg.includes('<text')) svg = await withWordImages(svg);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// --- Render ---------------------------------------------------------------------------------------------------
const stillDir = join(root, 'assets', 'emoji', 'still');
const animDir = join(root, 'assets', 'emoji', 'anim');
mkdirSync(stillDir, { recursive: true });
mkdirSync(animDir, { recursive: true });

let bytes = 0;
for (const e of api.list) {
  const still = await sharp(await frame(e.id, e.still, STILL_PX)).png({ compressionLevel: 9, palette: true, quality: 95 }).toBuffer();
  writeFileSync(join(stillDir, `${e.id}.png`), still);
  const n = Math.max(2, Math.round(e.dur * FPS));
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(await frame(e.id, i / n, ANIM_PX));
  const anim = await sharp(frames, { join: { animated: true } })
    .webp({ quality: 72, alphaQuality: 80, effort: 6, loop: 0, mixed: true, minSize: true, delay: Array(n).fill(Math.round(1000 / FPS)) })
    .toBuffer();
  writeFileSync(join(animDir, `${e.id}.webp`), anim);
  bytes += still.length + anim.length;
  process.stdout.write(`${e.id} `);
}
console.log(`\n${api.list.length} emoji, ${(bytes / 1024 / 1024).toFixed(2)} MB`);

// --- Data file ------------------------------------------------------------------------------------------------
const q = (s) => JSON.stringify(s);
const rows = api.list.map((e) => {
  const char = CHARS[e.id] ?? null;
  if (!char && e.cat !== 'greetings') throw new Error(`No character for ${e.id}`);
  return (
    `  { id: ${q(e.id)}, name: ${q(e.name)}, category: ${q(e.cat)}, char: ${char ? q(char) : 'null'},\n` +
    `    still: require('@/assets/emoji/still/${e.id}.png'), anim: require('@/assets/emoji/anim/${e.id}.webp') },`
  );
});
const cats = [...new Set(api.list.map((e) => e.cat))];
writeFileSync(
  join(root, 'src', 'lib', 'tm-emoji-data.ts'),
  `// Generated by scripts/gen-emoji.mjs from scripts/emoji/tm-emoji.js. Do not edit by hand.
import type { ImageRequireSource } from 'react-native';

export const TM_EMOJI_CATEGORIES = ${q(cats)} as const;
export type TmEmojiCategory = (typeof TM_EMOJI_CATEGORIES)[number];

export type TmEmoji = {
  id: string;
  // English name (greetings: the word on the sticker).
  name: string;
  category: TmEmojiCategory;
  // The emoji character it stands for in message text; null for greetings (sent as ":tm_<id>:").
  char: string | null;
  still: ImageRequireSource;
  anim: ImageRequireSource;
};

export const TM_EMOJI: TmEmoji[] = [
${rows.join('\n')}
];
`,
);
