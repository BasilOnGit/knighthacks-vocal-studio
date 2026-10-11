import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// npm workspaces hoist dependencies to the repo root, so don't assume
// apps/web/node_modules/rubberband-wasm exists: ask Node where it is.
const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve('rubberband-wasm/package.json'));
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

mkdirSync(publicDir, { recursive: true });
copyFileSync(join(packageDir, 'dist', 'rubberband.wasm'), join(publicDir, 'rubberband.wasm'));
console.log('copied rubberband.wasm to public/');
