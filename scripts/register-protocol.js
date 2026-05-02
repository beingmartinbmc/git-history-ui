#!/usr/bin/env node
/**
 * Optional post-install step that registers the `git-history-ui://` URL
 * scheme on platforms where we can do so without elevated privileges.
 *
 * Currently a Linux-only opportunistic implementation:
 *   - writes a desktop entry to ~/.local/share/applications/git-history-ui.desktop
 *   - calls `xdg-mime default git-history-ui.desktop x-scheme-handler/git-history-ui`
 *
 * macOS requires a `.app` bundle (Launch Services); Windows requires
 * registry edits. Both are deferred to a follow-up PR. Failures here are
 * silent so they never block npm install.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

if (process.env.GHUI_SKIP_PROTOCOL_REGISTER) process.exit(0);

(async () => {
  try {
    if (process.platform === 'linux') {
      await registerLinux();
    }
    // macOS / Windows: TODO — silent no-op for now.
  } catch {
    // Never fail the install over this.
  }
})();

async function registerLinux() {
  const home = os.homedir();
  const appsDir = path.join(home, '.local', 'share', 'applications');
  fs.mkdirSync(appsDir, { recursive: true });
  const desktopFile = path.join(appsDir, 'git-history-ui.desktop');
  const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
  const content = [
    '[Desktop Entry]',
    'Name=git-history-ui',
    'Exec=node ' + cliPath + ' --repo-from-url %u',
    'Terminal=false',
    'Type=Application',
    'NoDisplay=true',
    'MimeType=x-scheme-handler/git-history-ui;'
  ].join('\n') + '\n';
  fs.writeFileSync(desktopFile, content, 'utf8');
  await new Promise((resolve) => {
    execFile(
      'xdg-mime',
      ['default', 'git-history-ui.desktop', 'x-scheme-handler/git-history-ui'],
      { timeout: 5000 },
      () => resolve(undefined)
    );
  });
}
