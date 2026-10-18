import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase, uniqueChannelName } from '@/lib/supabase';

// Map stories: a photo with an optional caption, pinned on the home map near where it was posted, for 24 hours.
// The server stores only a point 100–250 m from the real location. Photos are in the private "story-photos" bucket
// at <my id>/<random>.jpg and open through signed links. Rules: supabase/migrations/*_map_stories.sql.

const BUCKET = 'story-photos';
const SIGNED_SECONDS = 60 * 60;
export const STORY_CAPTION_MAX = 150;

export type Story = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  photo_path: string;
  caption: string;
  lat: number;
  lng: number;
  area_name_en: string | null;
  area_name_th: string | null;
  created_at: string;
  expires_at: string;
};

// One map pin per person: their stories (oldest first, the order they're shown in) at their latest story's spot.
export type StoryGroup = { userId: string; name: string; avatarPath: string | null; lat: number; lng: number; stories: Story[] };

export function groupStories(stories: Story[]): StoryGroup[] {
  const groups = new Map<string, StoryGroup>();
  // map_stories is newest first, so the first story seen per person is their latest.
  for (const story of stories) {
    const group = groups.get(story.user_id);
    if (group) group.stories.unshift(story);
    else
      groups.set(story.user_id, {
        userId: story.user_id,
        name: story.display_name,
        avatarPath: story.avatar_path,
        lat: story.lat,
        lng: story.lng,
        stories: [story],
      });
  }
  return [...groups.values()];
}

// Every live story, shared by the home map and the story viewer (loaded once, kept fresh by Realtime).
let cache: Story[] | null = null;
const listeners = new Set<(stories: Story[] | null) => void>();

async function fetchStories() {
  const { data, error } = await supabase.rpc('map_stories');
  if (error) {
    console.warn('Loading stories failed', error.message);
    return;
  }
  cache = (data ?? []) as Story[];
  listeners.forEach((listener) => listener(cache));
}

export function reloadStories() {
  return fetchStories();
}

// Live stories (drops expired ones locally between loads). Pass enabled=false while signed out.
export function useStories(enabled = true) {
  const [stories, setStories] = useState<Story[] | null>(cache);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    listeners.add(setStories);
    if (!cache) fetchStories();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchStories();
    });
    const channel = supabase
      .channel(uniqueChannelName('stories'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => fetchStories())
      .subscribe();
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      listeners.delete(setStories);
      appState.remove();
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  const reload = useCallback(() => fetchStories(), []);
  const live = (stories ?? []).filter((story) => new Date(story.expires_at).getTime() > now);
  return { stories: stories === null ? null : live, reload };
}

export type StoryPhotoSource = 'camera' | 'library';

// Takes or picks a photo and shrinks it (longest side 1600 px, JPEG 0.8). Returns the local file, 'cancelled' or
// 'permission' (camera not allowed).
export async function pickStoryPhoto(source: StoryPhotoSource): Promise<string | 'cancelled' | 'permission' | 'error'> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'permission';
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
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
    return saved.uri;
  } catch (error) {
    console.warn('Preparing the story photo failed', error);
    return 'error';
  }
}

const POST_ERRORS = ['not_allowed', 'invalid_caption', 'invalid_location', 'too_many_stories'] as const;
export type PostStoryError = (typeof POST_ERRORS)[number] | 'location' | 'generic';

// Gets where I am right now, uploads the photo and posts the story.
export async function postStory(myId: string, localUri: string, caption: string): Promise<PostStoryError | null> {
  let coords: { latitude: number; longitude: number };
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return 'location';
    coords = (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords;
  } catch {
    return 'location';
  }

  const path = `${myId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  try {
    const bytes = await new File(localUri).arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg' });
    if (error) {
      console.warn('Story upload failed', error.message);
      return 'generic';
    }
  } catch (error) {
    console.warn('Story upload failed', error);
    return 'generic';
  }

  const { error } = await supabase.rpc('post_story', {
    p_photo_path: path,
    p_caption: caption.trim(),
    p_lat: coords.latitude,
    p_lng: coords.longitude,
  });
  if (error) {
    // Not posted: remove the file again (best effort).
    supabase.storage.from(BUCKET).remove([path]);
    return POST_ERRORS.find((key) => error.message.includes(key)) ?? 'generic';
  }
  await fetchStories();
  return null;
}

export async function deleteStory(story: Story): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_story', { p_story_id: story.id });
  if (error) {
    console.warn('Deleting the story failed', error.message);
    return false;
  }
  if (typeof data === 'string') supabase.storage.from(BUCKET).remove([data]);
  await fetchStories();
  return true;
}

// Deletes my expired stories and their photos, once per app start (they're already hidden from everyone).
let cleared = false;
export function clearMyExpiredStories() {
  if (cleared) return;
  cleared = true;
  supabase.rpc('clear_my_expired_stories').then(({ data, error }) => {
    if (error) {
      console.warn('Clearing old stories failed', error.message);
      cleared = false;
      return;
    }
    const paths = ((data ?? []) as unknown[]).filter((path): path is string => typeof path === 'string');
    if (paths.length) supabase.storage.from(BUCKET).remove(paths);
  });
}

const signed = new Map<string, { url: string; expires: number }>();

async function signedUrl(path: string): Promise<string | null> {
  const cached = signed.get(path);
  if (cached && cached.expires > Date.now() + 60_000) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error || !data) {
    console.warn('Opening the story photo failed', error?.message);
    return null;
  }
  signed.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_SECONDS * 1000 });
  return data.signedUrl;
}

// A link to a story photo (null while loading, 'error' if it can't be opened).
export function useStoryPhotoUrl(path: string | null) {
  const [state, setState] = useState<{ path: string; url: string | 'error' } | null>(null);
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

// "Just now" / "12 min" / "5 h" since the story was posted.
export function storyAge(createdAt: string, now: number): { key: 'justNow' | 'minutes' | 'hours'; count: number } {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return { key: 'justNow', count: 0 };
  if (minutes < 60) return { key: 'minutes', count: minutes };
  return { key: 'hours', count: Math.floor(minutes / 60) };
}
