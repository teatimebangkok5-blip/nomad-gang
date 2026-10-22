import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { skipNextOpenAd } from '@/lib/ads';
import { supabase } from '@/lib/supabase';

// Profile picture and up to 3 "best photos". Files go to the public "profile-photos" bucket under <user id>/…
// (the database only lets people write in their own folder); the paths are saved with update_my_photos.

const BUCKET = 'profile-photos';

// 'cover': a wide event photo (4:3).
export type PhotoKind = 'avatar' | 'photo' | 'cover';

export function profilePhotoUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Opens the phone's photo picker (with cropping), shrinks and compresses the photo, and uploads it to my folder in
// `bucket` (profile photos by default; Hidden Gems suggestions use "gem-photos", events "event-photos").
// Returns the new file's path, null if the person cancelled, or 'error'.
export async function pickAndUploadPhoto(
  myId: string,
  kind: PhotoKind,
  bucket: string = BUCKET,
): Promise<string | null | 'error'> {
  // Coming back from the gallery isn't "opening the app" (no app open ad).
  skipNextOpenAd();
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: kind === 'avatar' ? [1, 1] : kind === 'cover' ? [4, 3] : [4, 5],
    quality: 1,
  });
  if (picked.canceled || !picked.assets[0]) return null;

  try {
    const rendered = await ImageManipulator.manipulate(picked.assets[0].uri)
      .resize({ width: kind === 'avatar' ? 512 : kind === 'cover' ? 1280 : 1080 })
      .renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
    if (!saved.base64) return 'error';
    const binary = atob(saved.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const path = `${myId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: 'image/jpeg' });
    if (error) {
      console.warn('Photo upload failed', error.message);
      return 'error';
    }
    return path;
  } catch (error) {
    console.warn('Photo processing failed', error);
    return 'error';
  }
}

export async function saveMyPhotos(avatarPath: string | null, photoPaths: string[]): Promise<boolean> {
  const { error } = await supabase.rpc('update_my_photos', { p_avatar_path: avatarPath, p_photo_paths: photoPaths });
  if (error) console.warn('Saving photos failed', error.message);
  return !error;
}

// Old files are removed after they've been replaced (best effort).
export function deletePhotoFile(path: string | null | undefined) {
  if (!path) return;
  supabase.storage
    .from(BUCKET)
    .remove([path])
    .then(({ error }) => error && console.warn('Removing old photo failed', error.message));
}
