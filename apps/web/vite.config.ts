import { createPrivateKey, createPublicKey } from 'node:crypto';
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { releaseKeyProblems } from './src/keys.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const bundleDir = join(root, 'data/bundle');
const adminDir = join(root, 'admin');
const MIME: Record<string, string> = { '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// Public keys the app will accept (audit A5). Release: BUNDLE_PUBLIC_KEYS="active,spare" (base64 SPKI).
// Dev: derived from the throwaway key the pipeline writes to .keys/. Never both.
// WEB_RELEASE=1 (set by publish.yml) is a release: it stops unless exactly two good keys are given and the list it
// copies in was signed with the release key. A release can never fall back to the dev key.
const release = process.env.WEB_RELEASE === '1';
function pinnedKeys(): string[] {
  const env = process.env.BUNDLE_PUBLIC_KEYS;
  if (release) {
    const keys = (env ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const problems = releaseKeyProblems(keys);
    if (problems.length) throw new Error(`Release web build refused: ${problems.join('; ')}. Set BUNDLE_PUBLIC_KEYS (docs/OPERATIONS.md).`);
    const index = join(bundleDir, 'v1/index.json');
    const signing = existsSync(index) ? (JSON.parse(readFileSync(index, 'utf8')) as { signing?: string }).signing : undefined;
    if (signing !== 'release') throw new Error(`Release web build refused: data/bundle is ${signing ? `"${signing}"`: 'missing'}-signed. Run pnpm build:bundle:release first.`);
    return keys;
  }
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  const dev = join(root, '.keys/dev-ed25519.pem');
  if (!existsSync(dev)) { console.warn('No pinned keys: run `pnpm build:bundle` first (dev) or set BUNDLE_PUBLIC_KEYS (release).'); return []; }
  return [createPublicKey(createPrivateKey(readFileSync(dev, 'utf8'))).export({ type: 'spki', format: 'der' }).toString('base64')];
}

// The bundle is built by the pipeline into data/bundle (never committed), and the steward page lives in admin/
// with no build step. Serve both in dev; copy both on build. In production, /admin and /v1/steward sit behind Access.
function bundleFiles(): Plugin {
  return {
    name: '313help-bundle',
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
  // In dev, /v1 goes to `pnpm --filter @313help/api dev` if it is running. In production the Worker is routed on the same origin.
  server: { fs: { allow: [root] }, proxy: { '/v1': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
