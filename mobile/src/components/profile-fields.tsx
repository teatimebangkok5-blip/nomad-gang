import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { GlossyFill } from '@/components/glossy';
import { Icon, type IconName } from '@/components/icon';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { COUNTRIES, LANGUAGES } from '@/lib/countries';
import {
  CLOCK_CITIES,
  flagEmoji,
  formatDate,
  fromIsoDate,
  INTERESTS,
  matchesSearch,
  PROFESSIONS,
  toIsoDate,
  TRAVEL_STYLES,
} from '@/lib/profile-options';
import { makeStyles, useColors } from '@/lib/theme';

// Form pieces shared by the first-time questions, Edit profile, world clocks, countries visited and the trip form.

export type Option = { key: string; label: string; emoji?: string; search?: string[] };

// The translated choices for every profile question.
export function useProfileOptions() {
  const { t } = useTranslation();
  const language = useLanguage();
  const other = language === 'th' ? 'en' : 'th';
  const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label, language);
  return {
    countries: COUNTRIES.map((c) => ({ key: c.code, label: c[language], emoji: flagEmoji(c.code), search: [c[other], c.code] })).sort(byLabel),
    languages: [
      ...LANGUAGES.map((l) => ({ key: l.code, label: l[language], emoji: flagEmoji(l.flag), search: [l[other]] })).sort(byLabel),
      { key: 'other', label: t('about.otherLanguage'), emoji: '🌐' },
    ],
    professions: PROFESSIONS.map((key) => ({ key, label: t(`about.professions.${key}`) })),
    styles: TRAVEL_STYLES.map((key) => ({ key, label: t(`about.styles.${key}`) })),
    interests: INTERESTS.map(({ key, emoji }) => ({ key, emoji, label: t(`about.interestNames.${key}`) })),
    cities: CLOCK_CITIES.map((c) => ({ key: c.zone, label: c[language], emoji: '🕒', search: [c[other], c.zone] })).sort(byLabel),
  };
}

// Pills to pick one (`max` 1) or several options.
export function OptionChips({
  options,
  selected,
  onChange,
  max,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  max: number;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [limitHit, setLimitHit] = useState(false);

  function toggle(key: string) {
    if (selected.includes(key)) {
      setLimitHit(false);
      onChange(selected.filter((k) => k !== key));
    } else if (max === 1) {
      onChange([key]);
    } else if (selected.length >= max) {
      setLimitHit(true);
    } else {
      onChange([...selected, key]);
    }
  }

  return (
    <View>
      <View style={styles.chips}>
        {options.map((option) => (
          <Chip
            key={option.key}
            label={option.emoji ? `${option.emoji} ${option.label}` : option.label}
            selected={selected.includes(option.key)}
            onPress={() => toggle(option.key)}
          />
        ))}
      </View>
      {limitHit && <Text style={styles.hint}>{t('about.maxReached', { max })}</Text>}
    </View>
  );
}

// A row that opens a picker: label on top, the current value (or a placeholder) and a chevron.
export function PickerRow({
  icon,
  value,
  placeholder,
  onPress,
}: {
  icon: IconName;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ?? placeholder}
      onPress={onPress}
      style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}>
      <GlossyFill />
      <Icon name={icon} size={20} color={value ? Colors.accent : Colors.textMuted} />
      <Text style={[styles.pickerValue, !value && styles.placeholder]} numberOfLines={1}>
        {value ?? placeholder}
      </Text>
      <Icon name="chevronRight" size={20} color={Colors.textMuted} />
    </Pressable>
  );
}

// Full-screen list with a search box. `max` 1 picks one and closes; more shows check marks and a Done button.
type SearchPickerProps = {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  options: Option[];
  selected: string[];
  max: number;
  onDone: (keys: string[]) => void;
  onClose: () => void;
};

export function SearchPicker(props: SearchPickerProps) {
  const styles = useStyles();
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      {/* Mounted only while open, so each opening starts from the current selection. */}
      <SafeAreaView style={styles.modal} edges={['top', 'left', 'right', 'bottom']}>
        {props.visible && <SearchPickerBody {...props} />}
      </SafeAreaView>
    </Modal>
  );
}

function SearchPickerBody({ title, searchPlaceholder, options, selected, max, onDone, onClose }: SearchPickerProps) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>(selected);
  const [limitHit, setLimitHit] = useState(false);
  const single = max === 1;

  const shown = options.filter((option) => matchesSearch([option.label, ...(option.search ?? [])], query));
  // Chosen ones first, so they're easy to untick.
  const ordered = single ? shown : [...shown.filter((o) => picked.includes(o.key)), ...shown.filter((o) => !picked.includes(o.key))];

  function press(key: string) {
    if (single) {
      onDone([key]);
      return;
    }
    if (picked.includes(key)) {
      setLimitHit(false);
      setPicked(picked.filter((k) => k !== key));
    } else if (picked.length >= max) {
      setLimitHit(true);
    } else {
      setPicked([...picked, key]);
    }
  }

  return (
    <>
        <View style={styles.modalHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Icon name="close" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.modalTitle} numberOfLines={1}>
            {title}
          </Text>
          {!single && <Text style={styles.count}>{t('profile.selected', { count: picked.length })}</Text>}
        </View>
        <View style={styles.searchBox}>
          <Icon name="search" size={20} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={Colors.textMuted}
            selectionColor={Colors.orange}
            keyboardAppearance="dark"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        {limitHit && <Text style={[styles.hint, styles.hintPadded]}>{t('about.maxReached', { max })}</Text>}
        <FlatList
          data={ordered}
          keyExtractor={(option) => option.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('about.noResults')}</Text>}
          renderItem={({ item }) => {
            const on = picked.includes(item.key);
            return (
              <Pressable
                accessibilityRole={single ? 'button' : 'checkbox'}
                accessibilityState={single ? undefined : { checked: on }}
                onPress={() => press(item.key)}
                style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
                {item.emoji ? <Text style={styles.listEmoji}>{item.emoji}</Text> : null}
                <Text style={styles.listLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                {on && <Icon name="check" size={22} color={Colors.accent} />}
              </Pressable>
            );
          }}
        />
        {!single && (
          <View style={styles.footer}>
            <Button title={t('profile.done')} onPress={() => onDone(picked)} />
          </View>
        )}
    </>
  );
}

// A date shown as "4 May 1997" that opens the phone's date picker.
export function DateField({
  value,
  placeholder,
  onChange,
  minimumDate,
  maximumDate,
  initialDate,
}: {
  value: string | null;
  placeholder: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  // Where the picker opens when nothing is chosen yet.
  initialDate?: Date;
}) {
  const Colors = useColors();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const language = useLanguage();

  return (
    <>
      <PickerRow
        icon="event"
        value={value ? formatDate(value, language) : null}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
      />
      {open && (
        <DateTimePicker
          value={value ? fromIsoDate(value) : (initialDate ?? new Date())}
          mode="date"
          presentation="dialog"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          accentColor={Colors.orange}
          positiveButton={{ label: t('common.ok') }}
          negativeButton={{ label: t('common.cancel') }}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(toIsoDate(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.label}>{children}</Text>;
}

const useStyles = makeStyles((Colors) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hint: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.sm },
  hintPadded: { paddingHorizontal: Spacing.lg },
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  pressed: { opacity: 0.75 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  pickerValue: { ...Type.body, fontSize: 16, color: Colors.text, flex: 1 },
  placeholder: { color: Colors.textMuted },
  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    minHeight: 52,
  },
  close: { width: 44, height: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { ...Type.heading, color: Colors.text, flex: 1 },
  count: { ...Type.small, color: Colors.textMuted, marginRight: Spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 16 },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  listEmoji: { fontSize: 22 },
  listLabel: { ...Type.body, fontSize: 16, color: Colors.text, flex: 1 },
  empty: { ...Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl },
  footer: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
}));
