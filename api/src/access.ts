// Steward endpoints sit behind Cloudflare Access. Access puts a signed JWT on every request it
// lets through; we verify it here as well, so a misrouted or direct request cannot skip the login.
// Stewards sign in with their email; the pipeline uses an Access service token (no email, a common_name).

export interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
/** Reads the team's public keys from Access, every time it is called. */
export type JwksFetcher = (teamDomain: string) => Promise<Jwk[]>;
/** Finds the key a token names, fetching the keys only when needed. */
export type Keyring = (teamDomain: string, kid: string | undefined, now: Date) => Promise<Jwk | undefined>;
export interface AccessEnv { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string }

/** The one value `DEV_STEWARD` may hold, and only with no Cloudflare Access settings present (api/.dev.vars).
 *  It lives here, not in index.ts: the Workers runtime reads every named export of the main module as an entry
 *  point, and `wrangler dev` refuses to start with a string among them. */
export const DEV_STEWARD_VALUE = 'local';

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

export const fetchJwks: JwksFetcher = async (domain) => {
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('could not load Access certs');
  return ((await res.json()) as { keys: Jwk[] }).keys;
};

const HOUR = 3600_000, RETRY = 300_000;
/**
 * Keys are kept for an hour. Access rotates them now and then, so a token naming a key we don't have makes us fetch
 * again, but at most once per 5 minutes: a flood of made-up key ids can't hammer the certs endpoint. A failed fetch
 * keeps the keys we had and waits the same 5 minutes.
 */
export function keyring(fetchKeys: JwksFetcher = fetchJwks): Keyring {
  let domain = '', keys: Jwk[] = [], at = -Infinity;
  return async (d, kid, now) => {
    if (d !== domain) { domain = d; keys = []; at = -Infinity; }
    const find = () => keys.find((k) => k.kid === kid);
    const t = now.getTime();
    if ((t - at >= HOUR || !find()) && t - at >= RETRY) { at = t; keys = await fetchKeys(d).catch(() => keys); }
    return find();
  };
}

/** Returns who is calling, or null. Fails closed: no configuration means no access. */
export async function verifyAccess(token: string | undefined, env: AccessEnv, now: Date, keys: Keyring): Promise<{ who: string } | null> {
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64url(parts[0]!))) as { kid?: string; alg?: string };
    const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1]!))) as { aud?: string | string[]; iss?: string; exp?: number; email?: string; common_name?: string };
    if (header.alg !== 'RS256') return null;
    const jwk = await keys(env.ACCESS_TEAM_DOMAIN, header.kid, now);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (!claims.exp || claims.exp * 1000 < now.getTime()) return null;
    const who = claims.email ?? (claims.common_name ? `service:${claims.common_name}` : null);
    return who ? { who } : null;
  } catch { return null; }
}
