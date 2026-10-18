import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill } from '@/components/glossy';
import { Icon, type IconName } from '@/components/icon';
import { MeetupCard } from '@/components/meetup-card';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { GEM_CATEGORY_EMOJI, gemPhoto, setGemSaved, setGemUseful, useGems, type Gem } from '@/lib/gems';
import { distanceMeters } from '@/lib/location';
import { directionsUrl, meetupCoords, useOpenMeetups } from '@/lib/meetups';
import { makeStyles, useColors } from '@/lib/theme';
import { useVenues } from '@/lib/venues';

// Open tables / hangouts this close to a gem are shown on it.
const NEARBY_METERS = 300;

// One Hidden Gem: photo, what it is, price, hours, the local tip and the suggested activity, with "Start this
// activity" (a hangout there), open tables / hangouts nearby, save, useful, share and directions.
export default function GemScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { gems } = useGems();
  const venues = useVenues();
  const meetups = useOpenMeetups(Boolean(session));
  const gem = gems?.find((g) => g.id === id);

  if (!gem) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader />
        {gems === null ? (
          <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
        ) : (
          <Text style={styles.missing}>{t('gems.notFound')}</Text>
        )}
      </SafeAreaView>
    );
  }

  const name = localized(gem, 'name', language);
  const photo = gemPhoto(gem);
  const venueById = new Map(venues.venues.map((venue) => [venue.id, venue]));
  const nearby = meetups.meetups.filter((meetup) => {
    const at = meetupCoords(meetup, venueById);
    return at && distanceMeters(at, gem) <= NEARBY_METERS;
  });

  function startActivity(target: Gem) {
    const title = localized(target, 'activity', language).slice(0, 80);
    router.push(
      target.place_id
        ? { pathname: '/create-hangout', params: { placeId: target.place_id, title } }
        : {
            pathname: '/create-hangout',
            params: { spotLat: String(target.lat), spotLng: String(target.lng), spotName: name.slice(0, 80), title },
          },
    );
  }

  async function share(target: Gem) {
    await Share.share({
      message: t('gems.shareText', {
        name,
        area: localized(target, 'area', language),
        tip: localized(target, 'tip', language),
        maps: directionsUrl({ lat: target.lat, lng: target.lng, name }),
      }),
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader />
      <ScrollView contentContainerStyle={styles.content}>
        {photo && (
          <View>
            <Image source={photo.uri} style={styles.photo} contentFit="cover" accessibilityIgnoresInvertColors />
            {photo.credit && <Text style={styles.credit}>{photo.credit}</Text>}
          </View>
        )}
        <View style={styles.pad}>
          <Text style={styles.tag}>
            {GEM_CATEGORY_EMOJI[gem.category]} {localized(gem, 'subtitle', language) || t(`gems.categories.${gem.category}`)} ·{' '}
            {localized(gem, 'area', language)}
          </Text>
          <Text style={styles.name}>{name}</Text>
          <View style={styles.badges}>
            {gem.visited && <Text style={styles.badge}>{t('gems.visited')}</Text>}
            {gem.local_pick && <Text style={styles.badge}>{t('gems.localPick')}</Text>}
          </View>
          {localized(gem, 'description', language) ? (
            <Text style={styles.body}>{localized(gem, 'description', language)}</Text>
          ) : null}

          <View style={styles.facts}>
            <Fact icon="deal" text={localized(gem, 'budget', language) || (gem.min_spend === 0 ? t('gems.free') : t('gems.from', { price: gem.min_spend }))} />
            {localized(gem, 'hours', language) ? <Fact icon="time" text={localized(gem, 'hours', language)} /> : null}
          </View>

          {localized(gem, 'tip', language) ? (
            <View style={styles.box}>
              <GlossyFill />
              <Text style={styles.boxTitle}>💡 {t('gems.localTip')}</Text>
              <Text style={styles.body}>{localized(gem, 'tip', language)}</Text>
            </View>
          ) : null}

          {localized(gem, 'activity', language) ? (
            <View style={[styles.box, styles.activityBox]}>
              <GlossyFill />
              <Text style={styles.boxTitle}>🙌 {t('gems.activity')}</Text>
              <Text style={styles.body}>{localized(gem, 'activity', language)}</Text>
              <Button
                title={t('gems.startActivity')}
                variant="violet"
                icon={<Icon name="hangout" size={20} color={Colors.white} />}
                onPress={() => startActivity(gem)}
              />
            </View>
          ) : null}

          <View style={styles.actions}>
            <ActionButton
              icon={gem.saved ? 'heart' : 'heartOutline'}
              label={gem.saved ? t('gems.savedLabel') : t('gems.save')}
              onPress={() => setGemSaved(gem, !gem.saved)}
              active={gem.saved}
            />
            <ActionButton
              icon="check"
              label={t('gems.useful', { count: gem.useful })}
              onPress={() => setGemUseful(gem, !gem.i_found_useful)}
              active={gem.i_found_useful}
            />
            <ActionButton icon="share" label={t('gems.share')} onPress={() => share(gem)} />
            <ActionButton
              icon="map"
              label={t('gems.directions')}
              onPress={() => Linking.openURL(directionsUrl({ lat: gem.lat, lng: gem.lng, name }))}
            />
          </View>

          <Text style={styles.heading}>{t('gems.nearbyTitle')}</Text>
          {nearby.length === 0 ? (
            <Text style={styles.muted}>{t('gems.nearbyNone')}</Text>
          ) : (
            <View style={styles.list}>
              {nearby.map((meetup) => (
                <MeetupCard
                  key={meetup.id}
                  meetup={meetup}
                  venue={meetup.venue_id ? venueById.get(meetup.venue_id) : undefined}
                  onPress={() => router.push({ pathname: '/table/[id]', params: { id: meetup.id } })}
                />
              ))}
            </View>
          )}

          {gem.contributor_name && (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                gem.contributor_id && router.push({ pathname: '/profile/[userId]', params: { userId: gem.contributor_id } })
              }>
              <Text style={styles.muted}>{t('gems.suggestedBy', { name: gem.contributor_name })}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={Colors.accent} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.action, active && styles.actionActive, pressed && styles.pressed]}>
      <GlossyFill />
      <Icon name={icon} size={20} color={active ? Colors.pink : Colors.text} />
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl },
  missing: { ...Type.body, color: Colors.textSecondary, padding: Spacing.xl },
  content: { paddingBottom: Spacing.xxl * 2 },
  photo: { width: '100%', height: 240 },
  credit: { ...Type.small, fontSize: 10, color: Colors.textMuted, paddingHorizontal: Spacing.lg, paddingTop: 4 },
  pad: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  tag: { ...Type.small, color: Colors.accent, fontWeight: '700' },
  name: { ...Type.title, color: Colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  badge: {
    ...Type.small,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: Colors.violetTint,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  body: { ...Type.body, color: Colors.textSecondary },
  facts: { gap: Spacing.sm, marginTop: Spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  factText: { ...Type.body, color: Colors.text, flex: 1 },
  box: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  activityBox: { borderColor: Colors.violet },
  boxTitle: { ...Type.heading, color: Colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  actionActive: { borderColor: Colors.pink },
  pressed: { opacity: 0.8 },
  actionText: { ...Type.label, color: Colors.text },
  heading: { ...Type.heading, color: Colors.text, marginTop: Spacing.xl },
  muted: { ...Type.small, color: Colors.textSecondary, marginTop: Spacing.sm },
  list: { gap: Spacing.md },
}));
