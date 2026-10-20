import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { GlossyFill } from '@/components/glossy';
import { LevelBadge } from '@/components/level-badge';
import { RaisedSmall } from '@/constants/theme';
import { profilePhotoUrl } from '@/lib/photos';
import { makeStyles } from '@/lib/theme';

// Round picture for a chat or a person: their profile photo, else an emoji (groups, tables 👥, hangouts 🙌), else the
// first letter of the name. With `userId` (a person), their level shows as a badge on the corner.
export function ChatAvatar({
  name,
  photoPath,
  emoji,
  size = 48,
  userId,
}: {
  name: string;
  photoPath?: string | null;
  emoji?: string | null;
  size?: number;
  userId?: string | null;
}) {
  const styles = useStyles();
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={round}>
      <View style={[styles.avatar, round]}>
        <GlossyFill />
        {photoPath ? (
          <Image source={profilePhotoUrl(photoPath)} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : emoji ? (
          <Text style={{ fontSize: size * 0.48 }}>{emoji}</Text>
        ) : (
          <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{name.trim().slice(0, 1).toUpperCase() || '?'}</Text>
        )}
      </View>
      {userId ? <LevelBadge userId={userId} size={size} /> : null}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violetTint,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  initial: { fontWeight: '800', color: Colors.text },
}));
