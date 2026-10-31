import { readFileSync } from 'fs';
import { join } from 'path';

// These pages quote the release by hand; fail the release change that forgets one.
const ROOT = join(__dirname, '..', '..');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  version: string;
};

it.each([
  'README.md',
  'apps/chrome-extension/popup.html',
  'docs/wiki/Home.md',
  'docs/wiki/Backend-API-Reference.md'
])('%s quotes the current release', (file) => {
  expect(readFileSync(join(ROOT, file), 'utf8')).toContain(`v${version}`);
});
