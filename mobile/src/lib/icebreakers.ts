import type { Tone } from '@/constants/theme';
import type { Language } from '@/i18n';

// Icebreaker card decks for table / hangout and group chats. A card is sent as a chat message 'ice:<deck>:<number>'
// (send_chat_card), so everyone reads the same card in their own language. Keep numbers stable: cards already sent
// refer to them (add new cards at the end of a deck).

type Text = { en: string; th: string };
export type IcebreakerCard = Text & { answer?: Text };
export type Deck = {
  id: string;
  emoji: string;
  // The card colour in the chat.
  tone: Tone;
  name: Text;
  hint: Text;
  cards: IcebreakerCard[];
};

export const DECKS: Deck[] = [
  {
    id: 'travel',
    emoji: '✈️',
    tone: 'violet',
    name: { en: 'Travel tales', th: 'เรื่องเล่าการเดินทาง' },
    hint: { en: 'Stories from the road', th: 'เรื่องราวระหว่างทาง' },
    cards: [
      { en: "What's your most embarrassing travel story?", th: 'เรื่องน่าอายที่สุดตอนเดินทางของคุณคืออะไร?' },
      { en: 'Which place surprised you the most, and why?', th: 'ที่ไหนทำให้คุณเซอร์ไพรส์ที่สุด เพราะอะไร?' },
      { en: "What's the best thing a stranger has done for you on a trip?", th: 'คนแปลกหน้าเคยทำอะไรดีๆ ให้คุณตอนเดินทางบ้าง?' },
      { en: 'Window or aisle, and what does that say about you?', th: 'ริมหน้าต่างหรือริมทางเดิน แล้วมันบอกอะไรเกี่ยวกับคุณ?' },
      { en: "What's one thing you always pack, even if you shouldn't?", th: 'ของอะไรที่คุณพกทุกครั้ง ทั้งที่ไม่ควรพก?' },
      { en: 'Your worst travel mishap: missed flight, lost bag, wrong city?', th: 'เหตุการณ์แย่สุดตอนเดินทาง: ตกเครื่อง กระเป๋าหาย หรือไปผิดเมือง?' },
      { en: 'If you could live in any city for a year, where would it be?', th: 'ถ้าได้อยู่เมืองไหนก็ได้หนึ่งปี คุณจะเลือกที่ไหน?' },
      { en: "What's the most beautiful sunrise or sunset you've seen?", th: 'พระอาทิตย์ขึ้นหรือตกที่สวยที่สุดที่คุณเคยเห็นอยู่ที่ไหน?' },
      { en: 'What brought you to Bangkok?', th: 'อะไรพาคุณมาที่กรุงเทพฯ?' },
      { en: 'Solo trip or group trip, and why?', th: 'เที่ยวคนเดียวหรือเที่ยวเป็นกลุ่ม เพราะอะไร?' },
      { en: "What's a place everyone loves that you didn't?", th: 'ที่ไหนที่ใครๆ ก็ชอบ แต่คุณไม่ชอบ?' },
      { en: "Where's your next trip, and what's the plan?", th: 'ทริปต่อไปของคุณคือที่ไหน แล้ววางแผนไว้ยังไง?' },
    ],
  },
  {
    id: 'food',
    emoji: '🌶️',
    tone: 'orange',
    name: { en: 'Food & spice', th: 'อาหารและความเผ็ด' },
    hint: { en: 'For hungry minds', th: 'สำหรับสายกิน' },
    cards: [
      { en: "What's the spiciest thing you've ever eaten?", th: 'อาหารเผ็ดที่สุดที่คุณเคยกินคืออะไร?' },
      { en: 'Your death-row meal: starter, main and dessert?', th: 'มื้อสุดท้ายในชีวิต: ของเรียกน้ำย่อย จานหลัก และของหวาน?' },
      { en: "What's the strangest food you've tried, and would you eat it again?", th: 'อาหารแปลกที่สุดที่เคยลองคืออะไร แล้วจะกินอีกไหม?' },
      { en: 'Pad thai, khao soi or som tam: pick one forever.', th: 'ผัดไทย ข้าวซอย หรือส้มตำ: เลือกกินได้อย่างเดียวตลอดชีวิต' },
      { en: "What's a dish from home everyone here should try?", th: 'อาหารบ้านเกิดจานไหนที่ทุกคนที่นี่ควรลอง?' },
      { en: 'Best street food stall you know in Bangkok?', th: 'ร้านสตรีทฟู้ดที่ดีที่สุดในกรุงเทพฯ ที่คุณรู้จัก?' },
      { en: 'Breakfast person or brunch person?', th: 'สายอาหารเช้าหรือสายบรันช์?' },
      { en: 'What food did you hate as a kid but love now?', th: 'อาหารอะไรที่ตอนเด็กไม่ชอบ แต่ตอนนี้ชอบมาก?' },
      { en: "Can you cook? What's your signature dish?", th: 'คุณทำอาหารเป็นไหม? เมนูเด็ดของคุณคืออะไร?' },
      { en: 'Mango sticky rice: overrated or perfect?', th: 'ข้าวเหนียวมะม่วง: เกินจริงหรือสมบูรณ์แบบ?' },
      { en: "What's the most expensive meal you've had, and was it worth it?", th: 'มื้อที่แพงที่สุดที่เคยกินคืออะไร คุ้มไหม?' },
      { en: 'Coffee, tea or Thai iced tea?', th: 'กาแฟ ชา หรือชาไทย?' },
    ],
  },
  {
    id: 'wyr',
    emoji: '🤔',
    tone: 'lilac',
    name: { en: 'Would you rather', th: 'จะเลือกอะไร' },
    hint: { en: 'Pick one, explain why', th: 'เลือกหนึ่งอย่าง แล้วบอกเหตุผล' },
    cards: [
      { en: 'Would you rather eat only street food or only fine dining for a year?', th: 'จะกินแต่สตรีทฟู้ด หรือแต่ร้านหรูทั้งปี?' },
      { en: 'Would you rather travel without a phone or without a credit card?', th: 'จะเดินทางโดยไม่มีมือถือ หรือไม่มีบัตรเครดิต?' },
      { en: 'Would you rather live on a beach or in the mountains?', th: 'จะอยู่ริมทะเล หรืออยู่บนภูเขา?' },
      { en: 'Would you rather speak every language or play every instrument?', th: 'จะพูดได้ทุกภาษา หรือเล่นดนตรีได้ทุกชิ้น?' },
      { en: 'Would you rather have a tuk-tuk or a long-tail boat as your only transport?', th: 'จะใช้ตุ๊กตุ๊ก หรือเรือหางยาวเป็นพาหนะอย่างเดียว?' },
      { en: 'Would you rather never feel jet lag again or never wait in a queue again?', th: 'จะไม่เจ็ตแล็กอีกเลย หรือไม่ต้องต่อคิวอีกเลย?' },
      { en: 'Would you rather explore space or the deep sea?', th: 'จะสำรวจอวกาศ หรือใต้ทะเลลึก?' },
      { en: 'Would you rather always be 10 minutes early or 20 minutes late?', th: 'จะมาก่อนเวลา 10 นาทีเสมอ หรือสาย 20 นาทีเสมอ?' },
      { en: 'Would you rather give up spicy food or sweet food?', th: 'จะเลิกกินของเผ็ด หรือเลิกกินของหวาน?' },
      { en: 'Would you rather have a rooftop bar or a night market in your home?', th: 'จะมีรูฟท็อปบาร์ หรือตลาดกลางคืนอยู่ที่บ้าน?' },
      { en: 'Would you rather know everyone at a party or no one?', th: 'จะรู้จักทุกคนในงานปาร์ตี้ หรือไม่รู้จักใครเลย?' },
      { en: 'Would you rather visit the past or the future?', th: 'จะย้อนไปอดีต หรือไปอนาคต?' },
    ],
  },
  {
    id: 'trivia',
    emoji: '🇹🇭',
    tone: 'plan',
    name: { en: 'Thailand trivia', th: 'ควิซเมืองไทย' },
    hint: { en: 'Guess, then show the answer', th: 'ทายก่อน แล้วค่อยดูเฉลย' },
    cards: [
      {
        en: "Bangkok's full ceremonial name is one of the longest place names in the world. How long is it?",
        th: 'ชื่อเต็มของกรุงเทพฯ เป็นหนึ่งในชื่อสถานที่ที่ยาวที่สุดในโลก ยาวแค่ไหน?',
        answer: { en: 'About 168 letters (in the Thai script). Locals just say "Krung Thep".', th: 'ประมาณ 168 ตัวอักษร คนไทยเรียกสั้นๆ ว่า "กรุงเทพฯ"' },
      },
      {
        en: 'What does "sabai sabai" mean?',
        th: '"สบายสบาย" ในภาษาอังกฤษแปลว่าอะไร?',
        answer: { en: 'Relaxed, comfortable, all good.', th: 'Relaxed, comfortable, all good (สบายๆ ไม่มีอะไรต้องกังวล)' },
      },
      {
        en: "Which Thai dish was CNN's readers' pick as one of the world's most delicious foods?",
        th: 'อาหารไทยจานไหนเคยถูกผู้อ่าน CNN โหวตให้เป็นหนึ่งในอาหารอร่อยที่สุดในโลก?',
        answer: { en: 'Massaman curry (tom yum goong and som tam were on the list too).', th: 'แกงมัสมั่น (ต้มยำกุ้งและส้มตำก็ติดอันดับด้วย)' },
      },
      {
        en: 'Thailand was never colonised by a European power. True or false?',
        th: 'ไทยไม่เคยเป็นอาณานิคมของชาติยุโรป จริงหรือไม่?',
        answer: { en: "True: it's the only Southeast Asian country that wasn't.", th: 'จริง เป็นประเทศเดียวในเอเชียตะวันออกเฉียงใต้ที่ไม่เคยเป็นอาณานิคม' },
      },
      {
        en: 'How many letters (consonants) does the Thai alphabet have?',
        th: 'พยัญชนะไทยมีกี่ตัว?',
        answer: { en: '44 consonants (plus vowels and 4 tone marks).', th: '44 ตัว (ยังมีสระและวรรณยุกต์อีก 4 รูป)' },
      },
      {
        en: "What's the national flower of Thailand?",
        th: 'ดอกไม้ประจำชาติไทยคืออะไร?',
        answer: { en: 'Ratchaphruek, the golden shower tree (Cassia fistula).', th: 'ดอกราชพฤกษ์ (ดอกคูน)' },
      },
      {
        en: 'In which month is Songkran, the Thai New Year water festival?',
        th: 'สงกรานต์ตรงกับเดือนอะไร?',
        answer: { en: 'April (13–15 April).', th: 'เดือนเมษายน (13–15 เมษายน)' },
      },
      {
        en: 'What is the "wai"?',
        th: '"การไหว้" คืออะไร?',
        answer: { en: 'The Thai greeting: palms pressed together with a slight bow.', th: 'การทักทายแบบไทย พนมมือแล้วก้มศีรษะเล็กน้อย' },
      },
      {
        en: 'Which animal is a national symbol of Thailand?',
        th: 'สัตว์ชนิดใดเป็นสัตว์สัญลักษณ์ประจำชาติไทย?',
        answer: { en: 'The Thai elephant (chang).', th: 'ช้างไทย' },
      },
      {
        en: 'What river flows through Bangkok?',
        th: 'แม่น้ำสายใดไหลผ่านกรุงเทพฯ?',
        answer: { en: 'The Chao Phraya.', th: 'แม่น้ำเจ้าพระยา' },
      },
      {
        en: 'What do the three colours of the Thai flag stand for?',
        th: 'ธงชาติไทยสามสีหมายถึงอะไรบ้าง?',
        answer: { en: 'Red: the nation, white: religion, blue: the monarchy.', th: 'แดง: ชาติ ขาว: ศาสนา น้ำเงิน: พระมหากษัตริย์' },
      },
      {
        en: "What's the Thai word for \"delicious\"?",
        th: 'คำว่า "delicious" ภาษาไทยคืออะไร?',
        answer: { en: '"Aroi" (อร่อย). Add "mak" for "very": aroi mak!', th: '"อร่อย" ถ้าอร่อยมากก็ "อร่อยมาก!"' },
      },
    ],
  },
  {
    id: 'twenty',
    emoji: '🎯',
    tone: 'brand',
    name: { en: '20 Questions', th: '20 คำถาม' },
    hint: { en: 'One thinks, the rest ask yes/no questions', th: 'คนหนึ่งคิด ที่เหลือถามคำถามใช่/ไม่ใช่' },
    cards: [
      { en: 'Think of a famous Thai dish. The others have 20 yes/no questions to guess it.', th: 'คิดถึงอาหารไทยชื่อดังหนึ่งจาน คนอื่นมีคำถามใช่/ไม่ใช่ 20 ข้อเพื่อทาย' },
      { en: 'Think of a place in Bangkok. 20 yes/no questions to guess it.', th: 'คิดถึงสถานที่หนึ่งในกรุงเทพฯ ทายด้วยคำถามใช่/ไม่ใช่ 20 ข้อ' },
      { en: 'Think of a country you have visited. 20 questions!', th: 'คิดถึงประเทศที่คุณเคยไป ทายด้วย 20 คำถาม!' },
      { en: 'Think of a famous person. 20 yes/no questions to guess who.', th: 'คิดถึงคนดังหนึ่งคน ทายด้วยคำถามใช่/ไม่ใช่ 20 ข้อ' },
      { en: "Think of something on this table (or in this room). 20 questions!", th: 'คิดถึงของบนโต๊ะนี้ (หรือในห้องนี้) ทายด้วย 20 คำถาม!' },
      { en: 'Think of a movie or series. 20 yes/no questions to guess it.', th: 'คิดถึงหนังหรือซีรีส์หนึ่งเรื่อง ทายด้วยคำถามใช่/ไม่ใช่ 20 ข้อ' },
      { en: 'Think of an animal. 20 yes/no questions to guess it.', th: 'คิดถึงสัตว์หนึ่งชนิด ทายด้วยคำถามใช่/ไม่ใช่ 20 ข้อ' },
      { en: 'Think of a drink. 20 yes/no questions to guess it.', th: 'คิดถึงเครื่องดื่มหนึ่งอย่าง ทายด้วยคำถามใช่/ไม่ใช่ 20 ข้อ' },
    ],
  },
];

export function cardText(text: Text, language: Language): string {
  return language === 'th' ? text.th : text.en;
}

// 'ice:food:3' → the deck and the card (null if unknown, e.g. sent by a newer app version).
export function parseCard(body: string): { deck: Deck; card: IcebreakerCard; number: number } | null {
  const match = /^ice:([a-z]+):(\d+)$/.exec(body);
  if (!match) return null;
  const deck = DECKS.find((d) => d.id === match[1]);
  const number = Number(match[2]);
  const card = deck?.cards[number - 1];
  return deck && card ? { deck, card, number } : null;
}

export function cardId(deck: Deck, index: number): string {
  return `ice:${deck.id}:${index + 1}`;
}

// A card from the deck that isn't `skip` (the one showing now).
export function randomCardIndex(deck: Deck, skip: number | null): number {
  if (deck.cards.length < 2) return 0;
  let index = skip;
  while (index === skip) index = Math.floor(Math.random() * deck.cards.length);
  return index as number;
}
