import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';

import { skipNextOpenAd } from '@/lib/ads';
import { supabase } from '@/lib/supabase';

// Verified profiles (supabase/migrations/*_verification_women_only.sql): people send a selfie and a photo of an ID
// with their gender; the founder approves or rejects them in the admin panel and the photos are deleted right after.
// Approved people get the Verified badge; verified women can host and join women-only tables and hangouts. Nobody can
// read anyone's gender: the app only learns "verified" (user_badges) and, for me, my_verification.

const BUCKET = 'verifications';

export const GENDERS = ['woman', 'man', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export type MyVerification = {
  verified: boolean;
  woman: boolean;
  verified_at: string | null;
  // My latest request.
  status: 'pending' | 'approved' | 'rejected' | null;
  gender: Gender | null;
  reason: string | null;
  submitted_at: string | null;
};

const VERIFICATION_ERRORS = ['invalid_verification', 'verification_pending', 'too_many_requests'] as const;
export type VerificationError = (typeof VERIFICATION_ERRORS)[number] | 'upload_failed' | 'generic';

// My verification state (null while loading).
export function useMyVerification(enabled = true) {
  const [state, setState] = useState<MyVerification | null>(null);
  const load = useCallback(() => {
    if (!enabled) return;
    supabase.rpc('my_verification').then(({ data, error }) => {
      if (error) {
        console.warn('Loading verification failed', error.message);
        return;
      }
      const row = (data as MyVerification[] | null)?.[0];
      setState(
        row ?? { verified: false, woman: false, verified_at: null, status: null, gender: null, reason: null, submitted_at: null },
      );
    });
  }, [enabled]);
  useEffect(() => {
    load();
  }, [load]);
  return { verification: state, reload: load };
}

// Takes (camera) or picks (gallery) a photo and shrinks it (longest side 1600 px, JPEG 0.85). Returns the local file,
// 'cancelled', or 'permission' when the camera wasn't allowed.
export async function takeVerificationPhoto(source: 'camera' | 'library', front: boolean): Promise<string | 'cancelled' | 'permission'> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'permission';
  }
  skipNextOpenAd();
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };
  const picked =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return 'cancelled';
  const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
  const rendered = await ImageManipulator.manipulate(asset.uri)
    .resize(landscape ? { width: Math.min(1600, asset.width || 1600) } : { height: Math.min(1600, asset.height || 1600) })
    .renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return saved.uri;
}

async function upload(myId: string, uri: string, name: string): Promise<string | null> {
  const path = `${myId}/${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const bytes = await new File(uri).arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg' });
  if (error) {
    console.warn('Verification upload failed', error.message);
    return null;
  }
  return path;
}

// Uploads both photos to my private folder and sends the request.
export async function submitVerification(
  myId: string,
  gender: Gender,
  selfieUri: string,
  idUri: string,
): Promise<VerificationError | null> {
  try {
    const [selfie, id] = await Promise.all([upload(myId, selfieUri, 'selfie'), upload(myId, idUri, 'id')]);
    if (!selfie || !id) {
      const done = [selfie, id].filter((path): path is string => !!path);
      if (done.length) supabase.storage.from(BUCKET).remove(done);
      return 'upload_failed';
    }
    const { error } = await supabase.rpc('submit_verification', { p_gender: gender, p_selfie_path: selfie, p_id_path: id });
    if (error) {
      supabase.storage.from(BUCKET).remove([selfie, id]);
      console.warn('Sending verification failed', error.message);
      return VERIFICATION_ERRORS.find((key) => error.message.includes(key)) ?? 'generic';
    }
    return null;
  } catch (error) {
    console.warn('Verification failed', error);
    return 'upload_failed';
  }
}

// ---------------------------------------------------------------------------
// Everyone's badges (verified, trusted host). Requests from all badges on screen are collected for a moment and
// loaded in one call (user_badges, max 300 ids, nothing across a block); results are kept for 5 minutes.
// ---------------------------------------------------------------------------

export type Badges = { verified: boolean; trustedHost: boolean };

const BADGE_TTL = 5 * 60_000;
const NONE: Badges = { verified: false, trustedHost: false };
const badgeCache = new Map<string, { badges: Badges; at: number }>();
const badgeListeners = new Set<(ids: string[]) => void>();
const pendingBadges = new Set<string>();
let badgeTimer: ReturnType<typeof setTimeout> | null = null;

async function flushBadges() {
  badgeTimer = null;
  const ids = [...pendingBadges].slice(0, 300);
  ids.forEach((id) => pendingBadges.delete(id));
  if (pendingBadges.size) badgeTimer = setTimeout(flushBadges, 0);
  if (!ids.length) return;
  const { data, error } = await supabase.rpc('user_badges', { p_user_ids: ids });
  if (error) {
    console.warn('Loading badges failed', error.message);
    return;
  }
  const now = Date.now();
  ids.forEach((id) => badgeCache.set(id, { badges: NONE, at: now }));
  for (const row of (data ?? []) as { user_id: string; verified: boolean; trusted_host: boolean }[]) {
    badgeCache.set(row.user_id, { badges: { verified: row.verified, trustedHost: row.trusted_host }, at: now });
  }
  badgeListeners.forEach((listener) => listener(ids));
}

function requestBadges(ids: string[]) {
  const now = Date.now();
  const fresh: string[] = [];
  for (const id of ids) {
    const cached = badgeCache.get(id);
    if (cached && now - cached.at < BADGE_TTL) fresh.push(id);
    else pendingBadges.add(id);
  }
  // Already known: hand them over after this render (never set state while rendering).
  if (fresh.length) Promise.resolve().then(() => badgeListeners.forEach((listener) => listener(fresh)));
  if (pendingBadges.size && !badgeTimer) badgeTimer = setTimeout(flushBadges, 30);
}

// Badges of these people (missing until loaded).
export function useUserBadges(ids: (string | null | undefined)[]): Map<string, Badges> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))].sort();
  const key = wanted.join(',');
  const [badges, setBadges] = useState<Map<string, Badges>>(() => new Map());

  useEffect(() => {
    if (!key) return;
    const mine = new Set(key.split(','));
    const listener = (changed: string[]) => {
      const relevant = changed.filter((id) => mine.has(id));
      if (!relevant.length) return;
      setBadges((current) => {
        const next = new Map(current);
        relevant.forEach((id) => next.set(id, badgeCache.get(id)?.badges ?? NONE));
        return next;
      });
    };
    badgeListeners.add(listener);
    requestBadges([...mine]);
    return () => {
      badgeListeners.delete(listener);
    };
  }, [key]);

  return badges;
}
