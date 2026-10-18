# App fonts

From Google Fonts (via the `@expo-google-fonts/*` packages), SIL Open Font License 1.1, which allows bundling them
in the app:

- **Bricolage Grotesque** (headings): 500–800
- **Figtree** (everything else): 400–800
- **Anuphan** (Thai, replaces both in Thai): 400–700

They are embedded at build time by the `expo-font` plugin in `app.json` (one Android font family per typeface, so
`fontWeight` picks the right file). After adding or changing a file here, run `npx expo prebuild --platform android`
and build again. Font names are in `Fonts` (`src/constants/theme.ts`).
