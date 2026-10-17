import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { bangkokMinutes, deviceZone, formatClock } from '@/lib/bangkok-time';
import type { ChatMessage } from '@/lib/chat';
import { stopLiveLocation, useChatFileUrl } from '@/lib/chat-media';
import type { ChatKind } from '@/lib/messages';
import { makeStyles, useColors } from '@/lib/theme';

// Bubbles for photos, voice notes and live locations in a chat.

function clock(iso: string) {
  return formatClock(bangkokMinutes(new Date(iso), deviceZone()));
}

// "0:42"
function duration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

type BubbleProps = { message: ChatMessage; mine: boolean; onLongPress?: () => void };

export function PhotoBubble({ message, mine, onLongPress }: BubbleProps) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const url = useChatFileUrl(message.media_path);
  const [open, setOpen] = useState(false);
  const source = url && url !== 'error' && message.media_path ? { uri: url, cacheKey: message.media_path } : null;

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={t('chat.openPhoto')}
        onPress={() => source && setOpen(true)}
        onLongPress={onLongPress}
        style={[styles.photo, mine ? styles.photoMine : styles.photoTheirs]}>
        {source ? (
          <Image source={source} style={styles.photoImage} contentFit="cover" transition={150} />
        ) : url === 'error' ? (
          <Text style={styles.photoError}>{t('chat.fileFailed')}</Text>
        ) : (
          <ActivityIndicator color={Colors.accent} />
        )}
        <Text style={styles.photoTime}>{clock(message.created_at)}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(false)} accessibilityLabel={t('common.back')}>
          {source && <Image source={source} style={styles.viewerImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </>
  );
}

export function VoiceBubble({ message, mine, onLongPress }: BubbleProps) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const url = useChatFileUrl(message.media_path);
  const ready = Boolean(url && url !== 'error');
  const player = useAudioPlayer(ready ? { uri: url as string } : null);
  const status = useAudioPlayerStatus(player);
  const total = message.duration_ms ?? (status.duration ? status.duration * 1000 : 0);
  const progress = total > 0 ? Math.min(1, (status.currentTime * 1000) / total) : 0;
  const color = mine ? Colors.onBrand : Colors.text;

  // Back to the start when it finishes, so the next tap plays it again.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  function toggle() {
    if (status.playing) player.pause();
    else player.play();
  }

  return (
    <Pressable onLongPress={onLongPress} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, styles.voice]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? t('chat.pause') : t('chat.play')}
        disabled={!ready}
        onPress={toggle}
        style={[styles.playButton, mine ? styles.playMine : styles.playTheirs]}>
        {url === null ? (
          <ActivityIndicator color={color} size="small" />
        ) : (
          <Icon name={status.playing ? 'pause' : 'play'} size={22} color={mine ? Colors.orange : Colors.white} />
        )}
      </Pressable>
      <View style={styles.voiceBody}>
        <View style={[styles.track, mine && styles.trackMine]}>
          <View style={[styles.trackFill, mine && styles.trackFillMine, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.voiceMeta}>
          <Text style={[styles.meta, mine && styles.metaMine]}>
            {url === 'error' ? t('chat.fileFailed') : duration(status.playing || progress > 0 ? status.currentTime * 1000 : total)}
          </Text>
          <Text style={[styles.meta, mine && styles.metaMine]}>{clock(message.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function LocationBubble({ message, mine, chatKind, onLongPress }: BubbleProps & { chatKind: ChatKind }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const until = message.live_until ? new Date(message.live_until).getTime() : 0;
  const live = until > now;

  // Refresh "updated … ago" and the end of sharing.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [live]);

  const updated = message.location_updated_at ? new Date(message.location_updated_at).getTime() : null;
  const minutesAgo = updated ? Math.floor((now - updated) / 60000) : null;
  const updatedText =
    minutesAgo === null
      ? null
      : minutesAgo < 1
        ? t('chat.updatedJustNow')
        : minutesAgo < 60
          ? t('chat.updatedMinutes', { count: minutesAgo })
          : t('chat.updatedAt', { time: clock(message.location_updated_at as string) });
  const color = mine ? Colors.onBrand : Colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('chat.liveLocationTitle')}
      onPress={() => router.push({ pathname: '/live-location', params: { kind: chatKind, messageId: message.id } })}
      onLongPress={onLongPress}
      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, styles.location]}>
      <View style={styles.locationTop}>
        <View style={[styles.locationIcon, live && styles.locationIconLive]}>
          <Icon name="liveLocation" size={22} color={Colors.white} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.locationTitle, { color }]}>{t('chat.liveLocationTitle')}</Text>
          <Text style={[styles.meta, mine && styles.metaMine]}>
            {live ? t('chat.liveUntil', { time: clock(message.live_until as string) }) : t('chat.liveEnded')}
          </Text>
          {updatedText && <Text style={[styles.meta, mine && styles.metaMine]}>{updatedText}</Text>}
        </View>
        <Icon name="chevronRight" size={20} color={color} />
      </View>
      {mine && live && (
        <Pressable
          accessibilityRole="button"
          onPress={() => stopLiveLocation(chatKind, message.id)}
          style={({ pressed }) => [styles.stop, pressed && styles.pressed]}>
          <Icon name="stop" size={16} color={Colors.onBrand} />
          <Text style={styles.stopText}>{t('chat.stopSharing')}</Text>
        </Pressable>
      )}
      <Text style={[styles.time, mine && styles.metaMine]}>{clock(message.created_at)}</Text>
    </Pressable>
  );
}

const PHOTO_W = 220;

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  bubble: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg },
  bubbleMine: { backgroundColor: Colors.orange, borderBottomRightRadius: Radius.sm },
  bubbleTheirs: { backgroundColor: Colors.surfaceRaised, borderBottomLeftRadius: Radius.sm },
  photo: {
    width: PHOTO_W,
    height: PHOTO_W * 1.15,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMine: { borderBottomRightRadius: Radius.sm },
  photoTheirs: { borderBottomLeftRadius: Radius.sm },
  photoImage: { width: '100%', height: '100%' },
  photoError: { ...Type.small, color: Colors.textMuted, padding: Spacing.md, textAlign: 'center' },
  photoTime: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    fontSize: 11,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  viewer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.94)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '85%' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, width: 240 },
  playButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playMine: { backgroundColor: Colors.onBrand },
  playTheirs: { backgroundColor: Colors.violet },
  voiceBody: { flex: 1 },
  track: { height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  trackMine: { backgroundColor: 'rgba(0,0,0,0.18)' },
  trackFill: { height: 4, backgroundColor: Colors.violet },
  trackFillMine: { backgroundColor: Colors.onBrand },
  voiceMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  meta: { fontSize: 12, lineHeight: 16, color: Colors.textMuted },
  metaMine: { color: Colors.onBrand, opacity: 0.8 },
  location: { width: 250 },
  locationTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.textMuted,
  },
  locationIconLive: { backgroundColor: Colors.violet },
  locationTitle: { ...Type.label, fontSize: 15 },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.sm,
    minHeight: 34,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.onBrand,
  },
  stopText: { ...Type.label, color: Colors.onBrand },
  time: { fontSize: 11, lineHeight: 14, color: Colors.textMuted, alignSelf: 'flex-end', marginTop: 2 },
}));
