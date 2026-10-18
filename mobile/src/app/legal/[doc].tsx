import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { legalDoc, type LegalDocId } from '@/legal/content';
import { legalContact } from '@/lib/legal';
import { makeStyles } from '@/lib/theme';

// Terms of Use or Privacy Policy, in the app's language. Open from the welcome screen and Settings (signed in or not).
export default function LegalScreen() {
  const styles = useStyles();
  const language = useLanguage();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const id: LegalDocId = doc === 'privacy' ? 'privacy' : 'terms';
  const content = legalDoc(id, language, legalContact);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={content.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{content.updated}</Text>
        {content.intro.map((text) => (
          <Text key={text} style={styles.paragraph}>
            {text}
          </Text>
        ))}
        {content.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>
              {section.heading}
            </Text>
            {section.paragraphs.map((text) => (
              <Text key={text} style={styles.paragraph}>
                {text}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  updated: { ...Type.small, color: Colors.textMuted, marginBottom: Spacing.sm },
  section: { gap: Spacing.sm, marginTop: Spacing.lg },
  heading: { ...Type.heading, color: Colors.text },
  paragraph: { ...Type.body, color: Colors.textSecondary, lineHeight: 22 },
}));
