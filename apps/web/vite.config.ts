import { createPrivateKey, createPublicKey } from 'node:crypto';
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const bundleDir = join(root, 'data/bundle');
const adminDir = join(root, 'admin');
const MIME: Record<string, string> = { '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// Public keys the app will accept (audit A5). Release: BUNDLE_PUBLIC_KEYS="active,spare" (base64 SPKI).
// Dev: derived from the throwaway key the pipeline writes to .keys/. Never both.
function pinnedKeys(): string[] {
  const env = process.env.BUNDLE_PUBLIC_KEYS;
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  const dev = join(root, '.keys/dev-ed25519.pem');
  if (!existsSync(dev)) { console.warn('No pinned keys: run `pnpm build:bundle` first (dev) or set BUNDLE_PUBLIC_KEYS (release).'); return []; }
  return [createPublicKey(createPrivateKey(readFileSync(dev, 'utf8'))).export({ type: 'spki', format: 'der' }).toString('base64')];
}

// The bundle is built by the pipeline into data/bundle (never committed), and the steward page lives in admin/
// with no build step. Serve both in dev; copy both on build. In production, /admin and /v1/steward sit behind Access.
function bundleFiles(): Plugin {
  return {
    name: 'detroithelp-bundle',
    configureServer(server) {
      const serve = (mount: string, dir: string) => server.middlewares.use(mount, (req, res, next) => {
        let rel = decodeURIComponent((req.url ?? '').split('?')[0]!);
        if (rel === '' || rel.endsWith('/')) rel += 'index.html';
        const file = normalize(join(dir, rel));
        if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('content-type', MIME[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream'); res.setHeader('cache-control', 'no-store');
        createReadStream(file).pipe(res);
      });
      serve('/data/bundle', bundleDir);
      serve('/admin', adminDir);
    },
    closeBundle() {
      if (existsSync(bundleDir)) cpSync(bundleDir, join(root, 'apps/web/dist/data/bundle'), { recursive: true });
      cpSync(adminDir, join(root, 'apps/web/dist/admin'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [bundleFiles()],
  define: { __PINNED_KEYS__: JSON.stringify(pinnedKeys()) },
  // In dev, /v1 goes to `pnpm --filter @detroithelp/api dev` if it is running. In production the Worker is routed on the same origin.
  server: { fs: { allow: [root] }, proxy: { '/v1': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
