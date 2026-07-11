#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const OWNED_MARKER = 'git-history-ui protocol artifact';
const WINDOWS_ROOT = 'HKCU\\Software\\Classes\\git-history-ui';

function protocolPaths(home = os.homedir(), platform = process.platform) {
  const root = path.join(home, '.git-history-ui');
  const launcher = path.join(root, 'bin', platform === 'win32' ? 'protocol-open.cmd' : 'protocol-open');
  return {
    root,
    launcher,
    desktop: path.join(home, '.local', 'share', 'applications', 'git-history-ui.desktop'),
    app: path.join(home, 'Applications', 'git-history-ui.app')
  };
}

function renderPosixLauncher() {
  return `#!/bin/sh
# ${OWNED_MARKER}
candidate="$(command -v git-history-ui 2>/dev/null || true)"
case "$candidate" in
  ""|"$0"|*/_npx/*|*/.npm/_npx/*) ;;
  *) exec "$candidate" --repo-from-url "$1" ;;
esac
exec npx --yes git-history-ui@latest --repo-from-url "$1"
`;
}

function renderWindowsLauncher() {
  return `@echo off\r
rem ${OWNED_MARKER}\r
for /f "delims=" %%I in ('where git-history-ui 2^>nul') do (\r
  "%%I" --repo-from-url "%~1"\r
  exit /b %ERRORLEVEL%\r
)\r
npx --yes git-history-ui@latest --repo-from-url "%~1"\r
`;
}

function desktopQuote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderLinuxDesktop(launcher) {
  return `[Desktop Entry]
# ${OWNED_MARKER}
Name=git-history-ui
Exec=${desktopQuote(launcher)} %u
Terminal=false
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/git-history-ui;
X-Git-History-UI-Owned=true
`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderMacLauncher(launcher) {
  const escaped = String(launcher).replace(/(["\\$`])/g, '\\$1');
  return `#!/bin/sh
# ${OWNED_MARKER}
exec "${escaped}" "$1"
`;
}

function renderMacPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${xmlEscape(OWNED_MARKER)} -->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>git-history-ui</string>
  <key>CFBundleIdentifier</key><string>io.github.git-history-ui.protocol</string>
  <key>CFBundleName</key><string>git-history-ui</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleURLTypes</key>
  <array><dict>
    <key>CFBundleURLName</key><string>git-history-ui URL</string>
    <key>CFBundleURLSchemes</key><array><string>git-history-ui</string></array>
  </dict></array>
</dict>
</plist>
`;
}

function winQuote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function windowsOpenCommand(launcher) {
  return `${winQuote(launcher)} "%1"`;
}

function windowsInstallCommands(launcher) {
  return [
    ['add', WINDOWS_ROOT, '/ve', '/d', 'URL:git-history-ui', '/f'],
    ['add', WINDOWS_ROOT, '/v', 'URL Protocol', '/d', '', '/f'],
    ['add', WINDOWS_ROOT, '/v', 'OwnedBy', '/d', 'git-history-ui', '/f'],
    [
      'add',
      `${WINDOWS_ROOT}\\shell\\open\\command`,
      '/ve',
      '/d',
      windowsOpenCommand(launcher),
      '/f'
    ]
  ];
}

function run(exec, command, args) {
  return runCapture(exec, command, args).then((result) => result.ok);
}

function runCapture(exec, command, args) {
  return new Promise((resolve) => {
    exec(command, args, { timeout: 5000, encoding: 'utf8' }, (error, stdout) =>
      resolve({ ok: !error, stdout: String(stdout || '') })
    );
  });
}

function writeLauncher(paths, platform, fileSystem) {
  fileSystem.mkdirSync(path.dirname(paths.launcher), { recursive: true });
  fileSystem.writeFileSync(
    paths.launcher,
    platform === 'win32' ? renderWindowsLauncher() : renderPosixLauncher(),
    'utf8'
  );
  if (platform !== 'win32') fileSystem.chmodSync(paths.launcher, 0o755);
}

async function install(options = {}) {
  const platform = options.platform || process.platform;
  const fileSystem = options.fs || fs;
  const exec = options.execFile || execFile;
  const paths = protocolPaths(options.home || os.homedir(), platform);
  writeLauncher(paths, platform, fileSystem);

  if (platform === 'linux') {
    fileSystem.mkdirSync(path.dirname(paths.desktop), { recursive: true });
    fileSystem.writeFileSync(paths.desktop, renderLinuxDesktop(paths.launcher), 'utf8');
    await run(exec, 'xdg-mime', [
      'default',
      'git-history-ui.desktop',
      'x-scheme-handler/git-history-ui'
    ]);
  } else if (platform === 'darwin') {
    const contents = path.join(paths.app, 'Contents');
    const macos = path.join(contents, 'MacOS');
    fileSystem.mkdirSync(macos, { recursive: true });
    const executable = path.join(macos, 'git-history-ui');
    fileSystem.writeFileSync(executable, renderMacLauncher(paths.launcher), 'utf8');
    fileSystem.chmodSync(executable, 0o755);
    fileSystem.writeFileSync(path.join(contents, 'Info.plist'), renderMacPlist(), 'utf8');
    await run(
      exec,
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
      ['-f', paths.app]
    );
  } else if (platform === 'win32') {
    for (const args of windowsInstallCommands(paths.launcher)) await run(exec, 'reg', args);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return status({ ...options, platform, fs: fileSystem, execFile: exec });
}

function isOwned(file, fileSystem = fs) {
  try {
    return fileSystem.readFileSync(file, 'utf8').includes(OWNED_MARKER);
  } catch {
    return false;
  }
}

async function status(options = {}) {
  const platform = options.platform || process.platform;
  const fileSystem = options.fs || fs;
  const exec = options.execFile || execFile;
  const paths = protocolPaths(options.home || os.homedir(), platform);
  const launcher = isOwned(paths.launcher, fileSystem);
  let registration = false;
  if (platform === 'linux') {
    const result = await runCapture(exec, 'xdg-mime', [
      'query',
      'default',
      'x-scheme-handler/git-history-ui'
    ]);
    registration =
      isOwned(paths.desktop, fileSystem) &&
      result.ok &&
      result.stdout.trim() === 'git-history-ui.desktop';
  } else if (platform === 'darwin') {
    const result = await runCapture(
      exec,
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
      ['-dump']
    );
    registration =
      isOwned(path.join(paths.app, 'Contents', 'Info.plist'), fileSystem) &&
      result.ok &&
      result.stdout.includes('io.github.git-history-ui.protocol');
  } else if (platform === 'win32') {
    const owner = await runCapture(exec, 'reg', [
      'query',
      WINDOWS_ROOT,
      '/v',
      'OwnedBy'
    ]);
    const command = await runCapture(exec, 'reg', [
      'query',
      `${WINDOWS_ROOT}\\shell\\open\\command`,
      '/ve'
    ]);
    registration =
      owner.ok &&
      owner.stdout.includes('git-history-ui') &&
      command.ok &&
      command.stdout.toLowerCase().includes(paths.launcher.toLowerCase());
  }
  return { installed: launcher && registration, launcher, registration, paths };
}

function removeOwned(file, fileSystem) {
  if (isOwned(file, fileSystem)) fileSystem.rmSync(file, { force: true });
}

async function uninstall(options = {}) {
  const platform = options.platform || process.platform;
  const fileSystem = options.fs || fs;
  const exec = options.execFile || execFile;
  const paths = protocolPaths(options.home || os.homedir(), platform);

  if (platform === 'linux') {
    removeOwned(paths.desktop, fileSystem);
  } else if (platform === 'darwin') {
    const plist = path.join(paths.app, 'Contents', 'Info.plist');
    if (isOwned(plist, fileSystem)) fileSystem.rmSync(paths.app, { recursive: true, force: true });
  } else if (platform === 'win32') {
    const owned = await runCapture(exec, 'reg', ['query', WINDOWS_ROOT, '/v', 'OwnedBy']);
    if (owned.ok && owned.stdout.includes('git-history-ui')) {
      await run(exec, 'reg', ['delete', WINDOWS_ROOT, '/f']);
    }
  }
  removeOwned(paths.launcher, fileSystem);
  return { removed: true, paths };
}

async function main() {
  const action = process.argv[2] || 'status';
  if (!['install', 'status', 'uninstall'].includes(action)) {
    throw new Error('Usage: register-protocol.js install|status|uninstall');
  }
  const result =
    action === 'install' ? await install() : action === 'uninstall' ? await uninstall() : await status();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (action === 'status' && !result.installed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  OWNED_MARKER,
  WINDOWS_ROOT,
  desktopQuote,
  install,
  protocolPaths,
  renderLinuxDesktop,
  renderMacLauncher,
  renderMacPlist,
  renderPosixLauncher,
  renderWindowsLauncher,
  status,
  uninstall,
  winQuote,
  windowsInstallCommands,
  windowsOpenCommand
};
