import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, setLanguage, type Language } from '@/i18n';
import { signOut } from '@/lib/auth';
import { skipLogin } from '@/lib/preview';
import { makeStyles, useColors, useTheme, type ThemeName } from '@/lib/theme';

// Settings: appearance (dark / light), language, and sign out.
export default function SettingsScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { name: theme, setTheme } = useTheme();
  const language = currentLanguage();

  const themes: { value: ThemeName; label: string; icon: IconName }[] = [
    { value: 'dark', label: t('settings.dark'), icon: 'darkMode' },
    { value: 'light', label: t('settings.light'), icon: 'lightMode' },
  ];
  // Each language is named in its own language so people can always find theirs.
  const languages: { value: Language; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'th', label: 'ไทย' },
  ];

  function confirmSignOut() {
    Alert.alert(t('home.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('home.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('settings.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
        <View style={styles.group}>
          {themes.map((option) => (
            <OptionRow
              key={option.value}
              icon={option.icon}
              label={option.label}
              selected={theme === option.value}
              onPress={() => setTheme(option.value)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <View style={styles.group}>
          {languages.map((option) => (
            <OptionRow
              key={option.value}
              icon="language"
              label={option.label}
              selected={language === option.value}
              onPress={() => setLanguage(option.value)}
            />
          ))}
        </View>

        {!skipLogin && (
          <>
            <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
            <View style={styles.group}>
              <OptionRow icon="logout" label={t('home.signOut')} danger onPress={confirmSignOut} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OptionRow({
  icon,
  label,
  selected,
  danger = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();

  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Icon name={icon} size={22} color={danger ? Colors.danger : selected ? Colors.accent : Colors.textSecondary} />
      <Text style={[styles.rowLabel, danger && styles.rowDanger]}>{label}</Text>
      {selected && <Icon name="check" size={22} color={Colors.accent} />}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  sectionTitle: {
    ...Type.label,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  group: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowPressed: { backgroundColor: Colors.pressed },
  rowLabel: { ...Type.body, fontSize: 16, color: Colors.text, flex: 1 },
  rowDanger: { color: Colors.danger },
}));
