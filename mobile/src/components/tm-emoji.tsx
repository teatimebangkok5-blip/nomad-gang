import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as InlineImage, Pressable, ScrollView, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { GlossyFill } from '@/components/glossy';
import { Radius, RaisedSmall, Spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { makeStyles } from '@/lib/theme';
import {
  emojiByCategory,
  emojiPreview,
  greetingWord,
  TM_EMOJI_CATEGORIES,
  type TextPart,
  type TmEmoji,
  type TmEmojiCategory,
} from '@/lib/tm-emoji';

// TableMeet chat emoji (see src/lib/tm-emoji.ts): still pictures inline and in pickers, animated when a message is
// only emoji.

// What a screen reader says for one emoji: the character (the phone names it in its own language) or the greeting.
export function emojiLabel(emoji: TmEmoji, language: string): string {
  return emoji.char ?? greetingWord(emoji, language);
}

export function EmojiImage({ emoji, size, animated = false }: { emoji: TmEmoji; size: number; animated?: boolean }) {
  return (
    <Image
      source={animated ? emoji.anim : emoji.still}
      style={{ width: size, height: size }}
      contentFit="contain"
      autoplay={animated}
      accessible={false}
    />
  );
}

// A round picture of one emoji (e.g. a table chat's header).
export function EmojiAvatar({ emoji, size = 40 }: { emoji: TmEmoji; size?: number }) {
  const styles = useStyles();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <GlossyFill />
      <EmojiImage emoji={emoji} size={Math.round(size * 0.72)} />
    </View>
  );
}

// Message text with TableMeet emoji drawn inline at about the text's size.
export function EmojiText({
  parts,
  body,
  style,
  emojiSize = 22,
}: {
  parts: TextPart[];
  // The original text, read out by screen readers.
  body: string;
  style?: StyleProp<TextStyle>;
  emojiSize?: number;
}) {
  const language = useLanguage();
  return (
    <Text style={style} accessibilityLabel={emojiPreview(body, language)}>
      {parts.map((part, index) =>
        'text' in part ? (
          part.text
        ) : (
          // React Native's Image is the one that can sit inside Text.
          <InlineImage key={index} source={part.emoji.still} style={{ width: emojiSize, height: emojiSize }} />
        ),
      )}
    </Text>
  );
}

// 1–3 emoji sent on their own: big and animated, no bubble. Greetings are wider artwork, so they get more room.
export function BigEmoji({ emoji }: { emoji: TmEmoji[] }) {
  const styles = useStyles();
  const size = emoji.length === 1 ? (emoji[0].category === 'greetings' ? 136 : 112) : emoji.length === 2 ? 84 : 72;
  return (
    <View style={styles.bigRow}>
      {emoji.map((item, index) => (
        <EmojiImage key={`${item.id}-${index}`} emoji={item} size={size} animated />
      ))}
    </View>
  );
}

// Category tabs (each shows its first emoji) over a grid of that category. Used under the chat composer and for
// reactions (without greetings).
export function EmojiPanel({
  onPick,
  categories = TM_EMOJI_CATEGORIES,
  selected,
  height = 268,
}: {
  onPick: (emoji: TmEmoji) => void;
  categories?: readonly TmEmojiCategory[];
  // Highlighted, e.g. my current reaction.
  selected?: string | null;
  height?: number;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const [category, setCategory] = useState<TmEmojiCategory>(categories[0]);

  return (
    <View style={[styles.panel, { height }]}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {categories.map((item) => {
          const on = item === category;
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityLabel={t(`chat.emojiCategories.${item}`)}
              accessibilityState={{ selected: on }}
              onPress={() => setCategory(item)}
              style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}>
              <EmojiImage emoji={emojiByCategory(item)[0]} size={24} />
            </Pressable>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="always">
        {emojiByCategory(category).map((emoji) => (
          <Pressable
            key={emoji.id}
            accessibilityRole="button"
            accessibilityLabel={emojiLabel(emoji, language)}
            accessibilityState={{ selected: emoji.id === selected }}
            onPress={() => onPick(emoji)}
            style={({ pressed }) => [
              styles.cell,
              category === 'greetings' && styles.cellWide,
              emoji.id === selected && styles.cellOn,
              pressed && styles.pressed,
            ]}>
            <EmojiImage emoji={emoji} size={category === 'greetings' ? 64 : 34} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end' },
  panel: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: { width: 48, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: Colors.surfaceRaised },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  cell: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  cellWide: { width: '25%' },
  cellOn: { backgroundColor: Colors.violetTint },
  pressed: { opacity: 0.6 },
}));
