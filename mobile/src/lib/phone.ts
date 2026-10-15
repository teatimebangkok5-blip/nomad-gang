// Turns what people type into an E.164 number for Supabase.
// No "+": treated as a Thai number ("081 234 5678" or "81 234 5678" -> "+66812345678").
// With "+": an international number, used as typed (travelers and nomads keep their home numbers).
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const local = digits.startsWith('66') && digits.length === 11 ? digits.slice(2) : digits.replace(/^0/, '');
  // Thai mobile numbers have 9 digits after the country code.
  return /^[689]\d{8}$/.test(local) ? `+66${local}` : null;
}

// "+66812345678" -> "+66 81 234 5678" for display.
export function formatPhone(e164: string): string {
  const thai = e164.match(/^\+66(\d{2})(\d{3})(\d{4})$/);
  return thai ? `+66 ${thai[1]} ${thai[2]} ${thai[3]}` : e164;
}
