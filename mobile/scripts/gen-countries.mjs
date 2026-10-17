// Writes src/lib/countries.ts (countries and languages with English and Thai names from Node's CLDR data).
// Usage (from mobile/): node scripts/gen-countries.mjs src/lib/countries.ts
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const en = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const th = new Intl.DisplayNames(['th'], { type: 'region', fallback: 'none' });
const skip = new Set(['AC','CP','CQ','DG','EA','IC','TA','EU','EZ','UN','QO','XA','XB','ZZ','AN','BU','CS','DD','FX','NT','SU','TP','YD','YU','ZR']);
const rows = [];
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b);
  if (skip.has(code)) continue;
  const name = en.of(code);
  if (!name || name === code) continue;
  rows.push([code, name, th.of(code) ?? name]);
}
rows.sort((x, y) => x[1].localeCompare(y[1]));
const langs = [
  ['en','US'],['th','TH'],['zh','CN'],['hi','IN'],['es','ES'],['fr','FR'],['ar','SA'],['bn','BD'],['pt','PT'],['ru','RU'],
  ['ja','JP'],['de','DE'],['ko','KR'],['vi','VN'],['it','IT'],['tr','TR'],['id','ID'],['ms','MY'],['tl','PH'],['nl','NL'],
  ['pl','PL'],['uk','UA'],['fa','IR'],['ur','PK'],['ta','IN'],['te','IN'],['mr','IN'],['gu','IN'],['kn','IN'],['ml','IN'],
  ['pa','IN'],['ne','NP'],['si','LK'],['my','MM'],['km','KH'],['lo','LA'],['he','IL'],['el','GR'],['sv','SE'],['no','NO'],
  ['da','DK'],['fi','FI'],['cs','CZ'],['hu','HU'],['ro','RO'],['sw','KE'],['af','ZA'],['mn','MN'],
];
const len = new Intl.DisplayNames(['en'], { type: 'language' });
const lth = new Intl.DisplayNames(['th'], { type: 'language' });
const q = (s) => JSON.stringify(s);
let ts = `// Generated from the Unicode CLDR names built into Node (Intl.DisplayNames), English and Thai. Do not edit by hand:
// regenerate with: node scripts/gen-countries.mjs src/lib/countries.ts (from mobile/).

export type Country = { code: string; en: string; th: string };

export const COUNTRIES: Country[] = [
${rows.map(([c, e, t]) => `  { code: '${c}', en: ${q(e)}, th: ${q(t)} },`).join('\n')}
];

export type LanguageOption = { code: string; flag: string; en: string; th: string };

// Languages people can pick (ISO 639-1), each with a country flag that is commonly used for it.
export const LANGUAGES: LanguageOption[] = [
${langs.map(([c, f]) => `  { code: '${c}', flag: '${f}', en: ${q(len.of(c))}, th: ${q(lth.of(c))} },`).join('\n')}
];
`;
writeFileSync(out, ts);
console.log(rows.length, 'countries', langs.length, 'languages');
