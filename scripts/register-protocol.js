#!/usr/bin/env node
/**
 * Optional post-install step that registers the `git-history-ui://` URL
 * scheme on platforms where we can do so without elevated privileges.
 *
 * Linux opportunistic implementation:
 *   - writes a desktop entry to ~/.local/share/applications/git-history-ui.desktop
 *   - calls `xdg-mime default git-history-ui.desktop x-scheme-handler/git-history-ui`
 *
 * macOS writes a tiny user-local `.app` bundle and registers it with Launch
 * Services. Windows writes HKCU protocol-handler keys with `reg.exe`.
 * Failures here are silent so they never block npm install.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

if (require.main === module) {
  if (process.env.GHUI_SKIP_PROTOCOL_REGISTER) process.exit(0);
  void main();
}

async function main() {
  try {
    if (process.platform === 'linux') {
      await registerLinux();
    } else if (process.platform === 'darwin') {
      await registerMacos();
    } else if (process.platform === 'win32') {
      await registerWindows();
    }
  } catch {
    // Never fail the install over this.
  }
}

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

async function registerMacos() {
  const home = os.homedir();
  const appDir = path.join(home, 'Applications', 'git-history-ui.app');
  const contentsDir = path.join(appDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  fs.mkdirSync(macosDir, { recursive: true });

  const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
  const executable = path.join(macosDir, 'git-history-ui');
  const escapedCli = cliPath.replace(/(["\\$`])/g, '\\$1');
  fs.writeFileSync(
    executable,
    ['#!/bin/sh', `exec /usr/bin/env node "${escapedCli}" --repo-from-url "$1"`].join('\n') + '\n',
    'utf8'
  );
  fs.chmodSync(executable, 0o755);

  fs.writeFileSync(
    path.join(contentsDir, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>git-history-ui</string>
  <key>CFBundleIdentifier</key>
  <string>io.github.git-history-ui.protocol</string>
  <key>CFBundleName</key>
  <string>git-history-ui</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>git-history-ui URL</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>git-history-ui</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`,
    'utf8'
  );

  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  await new Promise((resolve) => {
    execFile(lsregister, ['-f', appDir], { timeout: 5000 }, () => resolve(undefined));
  });
}

async function registerWindows() {
  const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
  const command = windowsOpenCommand(process.execPath, cliPath);
  const root = 'HKCU\\Software\\Classes\\git-history-ui';
  const writes = [
    [root, '/ve', '/d', 'URL:git-history-ui', '/f'],
    [root, '/v', 'URL Protocol', '/d', '', '/f'],
    [`${root}\\DefaultIcon`, '/ve', '/d', `"${process.execPath}",0`, '/f'],
    [`${root}\\shell\\open\\command`, '/ve', '/d', command, '/f']
  ];

  for (const args of writes) {
    await new Promise((resolve) => {
      execFile('reg', ['add', ...args], { timeout: 5000 }, () => resolve(undefined));
    });
  }
}

function windowsOpenCommand(nodePath, cliPath) {
  return `${winQuote(nodePath)} ${winQuote(cliPath)} --repo-from-url "%1"`;
}

function winQuote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

module.exports = {
  windowsOpenCommand,
  winQuote
};
