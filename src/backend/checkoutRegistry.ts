import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** A local clone this tool has served before; lets portable links find custom clone locations. */
export interface Checkout {
  id: string;
  path: string;
  name: string;
  lastOpened: string;
}

const MAX_CHECKOUTS = 50;

// Resolved per call: HOME may change under tests, and the file is tiny.
const file = () => path.join(os.homedir(), '.git-history-ui', 'checkouts.json');

export const checkoutId = (dir: string): string =>
  crypto.createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 12);

function load(): Checkout[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8')) as {
      version?: number;
      checkouts?: Checkout[];
    };
    if (parsed.version === 1 && Array.isArray(parsed.checkouts)) {
      return parsed.checkouts.filter((c) => typeof c?.path === 'string');
    }
  } catch {
    /* missing or corrupt → empty */
  }
  return [];
}

// ponytail: read-modify-write without a lock; two processes remembering at once can lose one
// entry (the file stays valid via tmp + rename). Re-opening a repo re-adds it.
function save(checkouts: Checkout[]): void {
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}-${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, checkouts }, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Remembered checkouts that still exist on disk, most recently opened first. */
export function listCheckouts(): Checkout[] {
  return load()
    .filter((c) => fs.existsSync(path.join(c.path, '.git')))
    .sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
}

/** Remember (or refresh) a clone. Throws if `dir` is not a git checkout. */
export function rememberCheckout(dir: string): Checkout {
  const abs = path.resolve(dir);
  if (!fs.existsSync(path.join(abs, '.git'))) throw new Error(`Not a git checkout: ${abs}`);
  const entry: Checkout = {
    id: checkoutId(abs),
    path: abs,
    name: path.basename(abs),
    lastOpened: new Date().toISOString()
  };
  const rest = load().filter((c) => c.id !== entry.id);
  save([entry, ...rest].slice(0, MAX_CHECKOUTS));
  return entry;
}

/** Forget a clone by id or by path. Returns whether anything was removed. */
export function forgetCheckout(idOrPath: string): boolean {
  const id = /^[0-9a-f]{12}$/.test(idOrPath) ? idOrPath : checkoutId(idOrPath);
  const all = load();
  const kept = all.filter((c) => c.id !== id);
  if (kept.length === all.length) return false;
  save(kept);
  return true;
}
