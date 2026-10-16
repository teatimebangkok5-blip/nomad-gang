import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { PlanTimeline } from '@/components/plan-timeline';
import { VenueMap } from '@/components/venue-map';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import type { Coords, PlanStop } from '@/lib/planner';
import { makeStyles, useColors } from '@/lib/theme';

// A day plan: the map (numbered stops and the route from the start point) above the timeline.
export function PlanView({
  start,
  stops,
  onRemove,
}: {
  start: Coords | null;
  stops: PlanStop[];
  onRemove?: (key: string) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <PlanMap start={start} stops={stops} />
      <PlanTimeline stops={stops} onRemove={onRemove} />
    </View>
  );
}

// The plan's route on a map: a line from the start point through the numbered stops, zoomed to fit.
export function PlanMap({ start, stops, height = 260 }: { start: Coords | null; stops: PlanStop[]; height?: number }) {
  const route = [...(start ? [start] : []), ...stops.map((stop) => ({ lat: stop.lat, lng: stop.lng }))];
  return (
    <VenueMap
      height={height}
      userCoords={null}
      initialZoom={13}
      route={route}
      pins={stops.map((stop, index) => ({
        key: stop.key,
        lat: stop.lat,
        lng: stop.lng,
        emoji: String(index + 1),
        tone: 'violet' as const,
      }))}
      onPinPress={() => {}}
    />
  );
}

// "Make it a day hangout": how many people can join, then the button.
export function MakeHangoutBox({ loading, onMake }: { loading: boolean; onMake: (people: number) => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const [people, setPeople] = useState(8);
  return (
    <View style={styles.group}>
      <GlossyFill />
      <Text style={styles.groupTitle}>{t('plan.makeHangout')}</Text>
      <Text style={styles.muted}>{t('plan.makeHangoutHint')}</Text>
      <Text style={styles.label}>{t('plan.groupSize')}</Text>
      <View style={styles.stepper}>
        <Button title="−" variant="secondary" disabled={people <= 2} onPress={() => setPeople((n) => Math.max(2, n - 1))} />
        <Text style={styles.stepValue}>{people}</Text>
        <Button title="+" variant="secondary" disabled={people >= 30} onPress={() => setPeople((n) => Math.min(30, n + 1))} />
      </View>
      <View style={styles.action}>
        <Button
          title={t('plan.makeHangout')}
          variant="violet"
          icon={<Icon name="hangout" size={20} color={Colors.white} />}
          loading={loading}
          onPress={() => onMake(people)}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: Spacing.lg },
  group: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    ...Raised,
  },
  groupTitle: { ...Type.heading, color: Colors.text },
  muted: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.xs },
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  stepValue: { ...Type.title, color: Colors.text, minWidth: 40, textAlign: 'center' },
  action: { marginTop: Spacing.sm },
}));
