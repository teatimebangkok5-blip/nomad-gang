import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';

import { InstagramBadge } from '@/components/glossy';
import { DateField, FieldLabel, OptionChips, PickerRow, SearchPicker, useProfileOptions } from '@/components/profile-fields';
import { Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage } from '@/i18n';
import { ageOn, countryName, flagEmoji, languageLabel, MAX_INTERESTS, MAX_LANGUAGES } from '@/lib/profile-options';
import type { ProfileDetails } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';

// The profile questions, one component each, used step by step by the first-time questions (onboarding.tsx) and
// all together by Edit profile (edit-profile.tsx).

export type ProfileDraft = Omit<ProfileDetails, 'onboarded'>;

export const EMPTY_DRAFT: ProfileDraft = {
  display_name: '',
  instagram: null,
  birth_date: null,
  home_country: null,
  languages: [],
  profession: null,
  travel_style: null,
  interests: [],
};

export const MIN_AGE = 18;

export function birthdayLimits(today = new Date()) {
  return {
    max: new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate()),
    min: new Date(1900, 0, 1),
    initial: new Date(today.getFullYear() - 25, 0, 1),
  };
}

// Name and birthday are required; under-18s can't continue.
export function basicsValid(draft: ProfileDraft): boolean {
  return Boolean(draft.display_name.trim() && draft.birth_date && ageOn(draft.birth_date) >= MIN_AGE);
}

type FieldProps = { draft: ProfileDraft; onChange: (patch: Partial<ProfileDraft>) => void };

export function BasicsFields({ draft, onChange }: FieldProps) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const limits = birthdayLimits();
  const tooYoung = Boolean(draft.birth_date && ageOn(draft.birth_date) < MIN_AGE);

  return (
    <View>
      <FieldLabel>{t('about.name')}</FieldLabel>
      <TextInput
        value={draft.display_name}
        onChangeText={(display_name) => onChange({ display_name })}
        maxLength={60}
        autoComplete="name"
        selectionColor={Colors.orange}
        keyboardAppearance="dark"
        style={styles.input}
      />
      <FieldLabel>{t('about.birthday')}</FieldLabel>
      <DateField
        value={draft.birth_date}
        placeholder={t('about.chooseBirthday')}
        onChange={(birth_date) => onChange({ birth_date })}
        minimumDate={limits.min}
        maximumDate={limits.max}
        initialDate={limits.initial}
      />
      {tooYoung ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('profile.errors.too_young')}
        </Text>
      ) : (
        <Text style={styles.hint}>
          {draft.birth_date ? `${t('about.age', { age: ageOn(draft.birth_date) })} · ` : ''}
          {t('about.birthdayHint')}
        </Text>
      )}
    </View>
  );
}

export function CountryField({ draft, onChange }: FieldProps) {
  const { t } = useTranslation();
  const options = useProfileOptions();
  const language = currentLanguage();
  const [open, setOpen] = useState(false);
  const code = draft.home_country;

  return (
    <View>
      <PickerRow
        icon="flag"
        value={code ? `${flagEmoji(code)}  ${countryName(code, language)}` : null}
        placeholder={t('about.chooseCountry')}
        onPress={() => setOpen(true)}
      />
      <SearchPicker
        visible={open}
        title={t('about.chooseCountry')}
        searchPlaceholder={t('about.searchCountry')}
        options={options.countries}
        selected={code ? [code] : []}
        max={1}
        onClose={() => setOpen(false)}
        onDone={([picked]) => {
          setOpen(false);
          onChange({ home_country: picked ?? null });
        }}
      />
    </View>
  );
}

export function LanguagesField({ draft, onChange }: FieldProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const options = useProfileOptions();
  const language = currentLanguage();
  const [open, setOpen] = useState(false);

  return (
    <View>
      {draft.languages.length > 0 && (
        <View style={styles.tags}>
          {draft.languages.map((code) => {
            const label = languageLabel(code, language, t('about.otherLanguage'));
            return (
              <Text key={code} style={styles.tag}>
                {label.flag} {label.name}
              </Text>
            );
          })}
        </View>
      )}
      <PickerRow icon="language" value={null} placeholder={t('about.searchLanguage')} onPress={() => setOpen(true)} />
      <SearchPicker
        visible={open}
        title={t('about.languages')}
        searchPlaceholder={t('about.searchLanguage')}
        options={options.languages}
        selected={draft.languages}
        max={MAX_LANGUAGES}
        onClose={() => setOpen(false)}
        onDone={(languages) => {
          setOpen(false);
          onChange({ languages });
        }}
      />
    </View>
  );
}

export function ProfessionField({ draft, onChange }: FieldProps) {
  const options = useProfileOptions();
  return (
    <OptionChips
      options={options.professions}
      selected={draft.profession ? [draft.profession] : []}
      max={1}
      onChange={([profession]) => onChange({ profession: profession ?? null })}
    />
  );
}

export function TravelStyleField({ draft, onChange }: FieldProps) {
  const options = useProfileOptions();
  return (
    <OptionChips
      options={options.styles}
      selected={draft.travel_style ? [draft.travel_style] : []}
      max={1}
      onChange={([travel_style]) => onChange({ travel_style: travel_style ?? null })}
    />
  );
}

export function InterestsField({ draft, onChange }: FieldProps) {
  const options = useProfileOptions();
  return (
    <OptionChips
      options={options.interests}
      selected={draft.interests}
      max={MAX_INTERESTS}
      onChange={(interests) => onChange({ interests })}
    />
  );
}

export function InstagramField({ draft, onChange }: FieldProps) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  return (
    <View>
      <View style={styles.inputRow}>
        <InstagramBadge size={34} />
        <Text style={styles.at}>@</Text>
        <TextInput
          value={(draft.instagram ?? '').replace(/^@/, '')}
          onChangeText={(instagram) => onChange({ instagram })}
          placeholder={t('profile.instagramPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={80}
          selectionColor={Colors.orange}
          keyboardAppearance="dark"
          style={[styles.input, styles.inputFlex]}
        />
      </View>
      <Text style={styles.hint}>{t('profile.instagramHint')}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    color: Colors.text,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  inputFlex: { flex: 1 },
  at: { ...Type.title, color: Colors.textSecondary },
  hint: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.sm },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.sm,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  tag: {
    ...Type.label,
    color: Colors.text,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
}));
