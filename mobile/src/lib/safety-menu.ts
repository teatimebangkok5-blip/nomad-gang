import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { blockUser, reportUser } from '@/lib/chat';

// "⋮" menu for another person: Block or Report. Android dialogs fit 3 buttons, so reasons are a second dialog.
export function openSafetyMenu(input: {
  t: TFunction;
  name: string;
  myId: string;
  otherId: string;
  context: 'traveller' | 'direct' | 'table';
  contextId?: string;
  onBlocked: () => void;
}) {
  const { t, name, myId, otherId, context, contextId, onBlocked } = input;

  function report(reason: string) {
    reportUser({ myId, otherId, context, contextId, reason }).then((error) => {
      Alert.alert(error ? t(`chat.errors.${error}`) : t('chat.reported'));
    });
  }

  Alert.alert(name, undefined, [
    {
      text: t('chat.report'),
      onPress: () =>
        Alert.alert(t('chat.reportTitle', { name }), undefined, [
          { text: t('chat.reasonSpam'), onPress: () => report('spam') },
          { text: t('chat.reasonHarassment'), onPress: () => report('harassment') },
          { text: t('common.cancel'), style: 'cancel' },
        ]),
    },
    {
      text: t('chat.block'),
      style: 'destructive',
      onPress: () =>
        Alert.alert(t('chat.blockConfirm', { name }), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('chat.block'),
            style: 'destructive',
            onPress: () =>
              blockUser(myId, otherId).then((error) => {
                if (error) Alert.alert(t(`chat.errors.${error}`));
                else onBlocked();
              }),
          },
        ]),
    },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}
