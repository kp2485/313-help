// Steward endpoints sit behind Cloudflare Access. Access puts a signed JWT on every request it
// lets through; we verify it here as well, so a misrouted or direct request cannot skip the login.
// Stewards sign in with their email; the pipeline uses an Access service token (no email, a common_name).

export interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
export type JwksFetcher = (teamDomain: string) => Promise<Jwk[]>;
export interface AccessEnv { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string }

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

let cache: { domain: string; at: number; keys: Jwk[] } | null = null;
export const fetchJwks: JwksFetcher = async (domain) => {
  if (cache && cache.domain === domain && Date.now() - cache.at < 3600_000) return cache.keys;
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('could not load Access certs');
  const keys = ((await res.json()) as { keys: Jwk[] }).keys;
  cache = { domain, at: Date.now(), keys };
  return keys;
};

/** Returns who is calling, or null. Fails closed: no configuration means no access. */
export async function verifyAccess(token: string | undefined, env: AccessEnv, now: Date, jwks: JwksFetcher = fetchJwks): Promise<{ who: string } | null> {
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64url(parts[0]!))) as { kid?: string; alg?: string };
    const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1]!))) as { aud?: string | string[]; iss?: string; exp?: number; email?: string; common_name?: string };
    if (header.alg !== 'RS256') return null;
    const jwk = (await jwks(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
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
