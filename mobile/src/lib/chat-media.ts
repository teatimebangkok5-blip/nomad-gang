import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { chatError, type ChatErrorKey } from '@/lib/chat';
import { liveSharesChanged } from '@/lib/live-location';
import type { ChatKind } from '@/lib/messages';
import { skipNextOpenAd } from '@/lib/ads';
import { supabase } from '@/lib/supabase';

// Photos, voice notes and live location in chats. Files go to the private "chat-media" bucket at
// <chat kind>/<chat id>/<my id>/<random name> (only people in the chat can open them, through signed links that
// expire); the message is then sent with send_chat_attachment. Rules: supabase/migrations/*_chat_media.sql.

const BUCKET = 'chat-media';
const SIGNED_SECONDS = 60 * 60;

export type ChatRef = { kind: ChatKind; id: string };

// Live location can be shared for one of these (minutes).
export const LIVE_DURATIONS = [15, 60, 480] as const;
export type LiveMinutes = (typeof LIVE_DURATIONS)[number];

// Longest voice note.
export const MAX_VOICE_MS = 2 * 60 * 1000;

function randomName(ext: string) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

async function upload(ref: ChatRef, myId: string, bytes: Uint8Array | ArrayBuffer, ext: string, contentType: string) {
  const path = `${ref.kind}/${ref.id}/${myId}/${randomName(ext)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType });
  if (error) {
    console.warn('Chat upload failed', error.message);
    return null;
  }
  return path;
}

async function send(
  ref: ChatRef,
  kind: 'photo' | 'voice' | 'location',
  extra: { path?: string; durationMs?: number; lat?: number; lng?: number; minutes?: LiveMinutes },
): Promise<ChatErrorKey | null> {
  const { error } = await supabase.rpc('send_chat_attachment', {
    p_chat_kind: ref.kind,
    p_chat_id: ref.id,
    p_kind: kind,
    p_media_path: extra.path ?? null,
    p_duration_ms: extra.durationMs ?? null,
    p_lat: extra.lat ?? null,
    p_lng: extra.lng ?? null,
    p_live_minutes: extra.minutes ?? null,
  });
  if (error && extra.path) {
    // The message wasn't sent: remove the file again (best effort).
    supabase.storage.from(BUCKET).remove([extra.path]);
  }
  return chatError(error);
}

export type PhotoSource = 'camera' | 'library';

// Takes or picks a photo, shrinks it (longest side 1600 px, JPEG 0.8), uploads and sends it.
// 'cancelled' when the person backed out; 'permission' when the camera wasn't allowed.
export async function sendPhoto(
  ref: ChatRef,
  myId: string,
  source: PhotoSource,
): Promise<ChatErrorKey | 'cancelled' | 'permission' | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'permission';
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  // Coming back from the camera or gallery isn't "opening the app" (no app open ad).
  skipNextOpenAd();
  const picked =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return 'cancelled';

  try {
    const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
    const rendered = await ImageManipulator.manipulate(asset.uri)
      .resize(landscape ? { width: Math.min(1600, asset.width || 1600) } : { height: Math.min(1600, asset.height || 1600) })
      .renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    const bytes = await new File(saved.uri).arrayBuffer();
    const path = await upload(ref, myId, bytes, 'jpg', 'image/jpeg');
    if (!path) return 'generic';
    return await send(ref, 'photo', { path });
  } catch (error) {
    console.warn('Sending photo failed', error);
    return 'generic';
  }
}

// Uploads a finished recording (m4a) and sends it.
export async function sendVoiceNote(ref: ChatRef, myId: string, uri: string, durationMs: number): Promise<ChatErrorKey | null> {
  try {
    const bytes = await new File(uri).arrayBuffer();
    const path = await upload(ref, myId, bytes, 'm4a', 'audio/mp4');
    if (!path) return 'generic';
    return await send(ref, 'voice', { path, durationMs: Math.min(Math.round(durationMs), MAX_VOICE_MS) });
  } catch (error) {
    console.warn('Sending voice note failed', error);
    return 'generic';
  }
}

// Starts sharing my live location in this chat. The phone keeps it up to date while the app is open
// (useLiveLocationSharing in the root layout).
export async function startLiveLocation(ref: ChatRef, minutes: LiveMinutes): Promise<ChatErrorKey | 'permission' | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return 'permission';
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const result = await send(ref, 'location', {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      minutes,
    });
    if (!result) liveSharesChanged();
    return result;
  } catch (error) {
    console.warn('Getting location failed', error);
    return 'generic';
  }
}

// Edit the text of one of my messages.
export async function editMessage(kind: ChatKind, messageId: string, body: string): Promise<ChatErrorKey | null> {
  const { error } = await supabase.rpc('edit_chat_message', { p_chat_kind: kind, p_message_id: messageId, p_body: body });
  return chatError(error);
}

// Take back one of my messages; a photo's or voice note's file is deleted too.
export async function unsendMessage(kind: ChatKind, messageId: string): Promise<ChatErrorKey | null> {
  const { data, error } = await supabase.rpc('unsend_chat_message', { p_chat_kind: kind, p_message_id: messageId });
  if (!error && typeof data === 'string' && data) {
    supabase.storage
      .from(BUCKET)
      .remove([data])
      .then(({ error: removeError }) => removeError && console.warn('Removing chat file failed', removeError.message));
  }
  if (!error) liveSharesChanged();
  return chatError(error);
}

export async function stopLiveLocation(kind: ChatKind, messageId: string): Promise<ChatErrorKey | null> {
  const { error } = await supabase.rpc('stop_live_location', { p_chat_kind: kind, p_message_id: messageId });
  liveSharesChanged();
  return chatError(error);
}

// Signed links are made once per file and reused until shortly before they expire.
const signed = new Map<string, { url: string; expires: number }>();

async function signedUrl(path: string): Promise<string | null> {
  const cached = signed.get(path);
  if (cached && cached.expires > Date.now() + 60_000) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error || !data) {
    console.warn('Opening chat file failed', error?.message);
    return null;
  }
  signed.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_SECONDS * 1000 });
  return data.signedUrl;
}

// A link to open a chat photo or voice note (null while loading, 'error' if it can't be opened).
export function useChatFileUrl(path: string | null) {
  const [state, setState] = useState<{ path: string; url: string | null | 'error' } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    signedUrl(path).then((url) => {
      if (alive) setState({ path, url: url ?? 'error' });
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return state && state.path === path ? state.url : null;
}
