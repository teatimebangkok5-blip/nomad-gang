import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { GlossyFill, ToneFill } from '@/components/glossy';
import { RoundButton } from '@/components/round-button';
import { Fonts, Radius, Raised, Spacing } from '@/constants/theme';
import { type Language, setLanguage, useLanguage } from '@/i18n';
import { makeStyles, useColors } from '@/lib/theme';

const SHORT: Record<Language, string> = { en: 'EN', th: 'ไทย' };

// Round header button showing the current language ("EN" / "ไทย"); tapping switches to the other one.
export function LanguageToggle() {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();

  return (
    <RoundButton label={t('common.switchLanguageA11y')} onPress={() => setLanguage(language === 'th' ? 'en' : 'th')}>
      <Text style={styles.short}>{SHORT[language]}</Text>
    </RoundButton>
  );
}

// EN | ไทย segmented switch (welcome screen): the current language is orange.
export function LanguageSegment() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();

  return (
    <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel={t('common.switchLanguageA11y')}>
      <GlossyFill />
      {(['en', 'th'] as const).map((option) => {
        const selected = option === language;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setLanguage(option)}
            style={styles.option}>
            {selected && <ToneFill tone="orange" />}
            <Text style={[styles.optionText, { color: selected ? Colors.onBrand : Colors.text }]}>{SHORT[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  short: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '800', color: Colors.text },
  segment: {
    flexDirection: 'row',
    padding: 4,
    gap: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  option: {
    minWidth: 48,
    height: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { fontFamily: Fonts.body, fontSize: 13, fontWeight: '800' },
}));
