// Prints a new Ed25519 key pair. Run twice: one active key (GitHub Actions secret
// BUNDLE_SIGNING_KEY) and one spare kept offline. Pin BOTH public keys in the clients (docs/12).
import { generate } from './sign.js';
const k = generate();
console.log('PUBLIC KEY (pin this in the apps):\n' + k.publicB64 + '\n');
console.log('PRIVATE KEY (store as a secret; never commit):\n' + k.privatePem);
