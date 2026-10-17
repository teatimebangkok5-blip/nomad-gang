import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlossyFill } from '@/components/glossy';
import { Icon, type IconName } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { currentLanguage, setLanguage, type Language } from '@/i18n';
import { signOut, useAuth } from '@/lib/auth';
import { skipLogin } from '@/lib/preview';
import { makeStyles, useColors, useTheme, type ThemeName } from '@/lib/theme';
import { useDiscoverable } from '@/lib/travellers';

// Settings: my rewards, appearance (dark / light), language, visibility to travellers, and sign out.
export default function SettingsScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { name: theme, setTheme } = useTheme();
  const language = currentLanguage();
  const Colors = useColors();
  const { session } = useAuth();
  const visibility = useDiscoverable(session?.user.id);

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
        <View style={styles.group}>
          <GlossyFill />
          <OptionRow icon="deal" label={`🎁 ${t('rewards.title')}`} onPress={() => router.push('/rewards')} />
        </View>

        <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
        <View style={styles.group}>
          <GlossyFill />
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
          <GlossyFill />
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

        <Text style={styles.sectionTitle}>{t('settings.privacy')}</Text>
        <View style={styles.group}>
          <GlossyFill />
          <View style={styles.row}>
            <Icon name="travellers" size={22} color={visibility.on ? Colors.accent : Colors.textSecondary} />
            <View style={styles.switchText}>
              <Text style={styles.rowLabel}>{t('travellers.turnOn')}</Text>
              <Text style={styles.rowHint}>{t('travellers.visibleHint')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('travellers.turnOn')}
              value={visibility.on === true}
              disabled={visibility.on === null}
              onValueChange={(next) => {
                visibility.set(next);
              }}
              trackColor={{ false: Colors.borderStrong, true: Colors.orange }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        {!skipLogin && (
          <>
            <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
            <View style={styles.group}>
              <GlossyFill />
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
    ...Raised,
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
  switchText: { flex: 1, paddingVertical: Spacing.sm },
  rowHint: { ...Type.small, color: Colors.textMuted },
}));
