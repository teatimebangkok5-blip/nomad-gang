import 'i18next';

import type en from './en';

// Makes t('home.title') type-checked against the English strings.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
