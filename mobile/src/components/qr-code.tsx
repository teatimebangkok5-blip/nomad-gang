import createQr from 'qrcode-generator';
import { View } from 'react-native';

// A QR code drawn with plain views (no native module): dark modules in a row are merged into one bar.
// Always black on white with a quiet zone, whatever the app theme, so phone cameras read it.
export function QrCode({ value, size }: { value: string; size: number }) {
  const qr = createQr(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const cell = size / (count + quiet * 2);

  const rows = [];
  for (let row = 0; row < count; row++) {
    const bars = [];
    let col = 0;
    while (col < count) {
      if (!qr.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < count && qr.isDark(row, col)) col++;
      bars.push(
        <View
          key={start}
          style={{ position: 'absolute', left: start * cell, width: (col - start) * cell, top: 0, bottom: 0, backgroundColor: '#000' }}
        />,
      );
    }
    rows.push(
      <View key={row} style={{ position: 'absolute', left: quiet * cell, right: quiet * cell, top: (row + quiet) * cell, height: cell + 0.5 }}>
        {bars}
      </View>,
    );
  }

  return (
    <View accessibilityRole="image" style={{ width: size, height: size, backgroundColor: '#FFF', borderRadius: 12 }}>
      {rows}
    </View>
  );
}
