// Sign in with Apple tokens. Apple requires that deleting an account also revokes the app's Apple tokens (App Store
// guideline 5.1.1(v)). Called with the person's own session (the app) or the founder's (admin panel):
//
//   { action: 'save', code }              right after Sign in with Apple: swaps the one-time authorization code for a
//                                         refresh token and keeps it (public.save_apple_token).
//   { action: 'revoke', userId?, code? }  before an account is deleted: revokes the kept token (userId: someone else,
//                                         admins only, checked by public.apple_token_for). Without a kept token, a
//                                         fresh code from the person's phone is swapped and revoked instead.
//                                         Answers { revoked: boolean, reason?: 'no_token' }.
//
// Secrets (Supabase → Edge Functions → Secrets): APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 file's text,
// from Apple Developer → Keys, with "Sign in with Apple" on) and optionally APPLE_CLIENT_ID (default com.tablemeet.app).
// Deploy: npx supabase functions deploy apple-account --no-verify-jwt (README, iPhone step 2). The function checks the
// session itself, because the gateway's JWT check doesn't support the project's new API keys.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { importPKCS8, SignJWT } from 'npm:jose@5.10.0';

const TEAM_ID = Deno.env.get('APPLE_TEAM_ID');
const KEY_ID = Deno.env.get('APPLE_KEY_ID');
const PRIVATE_KEY = Deno.env.get('APPLE_PRIVATE_KEY');
const CLIENT_ID = Deno.env.get('APPLE_CLIENT_ID') || 'com.tablemeet.app';

type AppleTokens = { refresh_token?: string; access_token?: string; error?: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Apple's "client secret": a short-lived JWT signed with the Sign in with Apple key.
async function clientSecret() {
  const key = await importPKCS8((PRIVATE_KEY as string).replace(/\\n/g, '\n').trim(), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuer(TEAM_ID as string)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience('https://appleid.apple.com')
    .setSubject(CLIENT_ID)
    .sign(key);
}

async function apple(path: 'token' | 'revoke', params: Record<string, string>) {
  const response = await fetch(`https://appleid.apple.com/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: await clientSecret(), ...params }),
  });
  const text = await response.text();
  let body: AppleTokens = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Revoke answers with an empty body.
  }
  if (!response.ok) console.warn(`Apple ${path} failed`, response.status, body.error ?? text.slice(0, 200));
  return { ok: response.ok, body };
}

const swapCode = (code: string) => apple('token', { grant_type: 'authorization_code', code });

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!TEAM_ID || !KEY_ID || !PRIVATE_KEY) return json({ error: 'not_configured' }, 500);

  // Act as the caller: their session and the project's public key, both sent by supabase-js.
  const authorization = request.headers.get('Authorization');
  const apikey = request.headers.get('apikey');
  if (!authorization || !apikey) return json({ error: 'auth_required' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') as string, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth } = await supabase.auth.getUser(authorization.replace(/^Bearer /i, ''));
  if (!auth.user) return json({ error: 'auth_required' }, 401);

  let body: { action?: unknown; code?: unknown; userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const code = typeof body.code === 'string' && body.code.length > 0 && body.code.length < 1000 ? body.code : null;

  if (body.action === 'save') {
    if (!code) return json({ error: 'bad_request' }, 400);
    const tokens = await swapCode(code);
    if (!tokens.ok || !tokens.body.refresh_token) return json({ error: 'apple_failed' }, 502);
    const { error } = await supabase.rpc('save_apple_token', { p_token: tokens.body.refresh_token });
    if (error) return json({ error: 'save_failed' }, 500);
    return json({ ok: true });
  }

  if (body.action === 'revoke') {
    const userId = typeof body.userId === 'string' ? body.userId : auth.user.id;
    const { data: kept, error } = await supabase.rpc('apple_token_for', { p_user: userId });
    if (error) return json({ error: 'not_allowed' }, 403);
    let token = typeof kept === 'string' ? kept : null;
    let hint = 'refresh_token';
    if (!token && code && userId === auth.user.id) {
      const tokens = await swapCode(code);
      token = tokens.body.refresh_token ?? tokens.body.access_token ?? null;
      hint = tokens.body.refresh_token ? 'refresh_token' : 'access_token';
    }
    if (!token) return json({ revoked: false, reason: 'no_token' });
    const revoked = await apple('revoke', { token, token_type_hint: hint });
    return json({ revoked: revoked.ok });
  }

  return json({ error: 'bad_request' }, 400);
});
