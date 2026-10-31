import fs from 'fs';
import os from 'os';
import path from 'path';

const {
  install,
  macPlistEdits,
  protocolPaths,
  status,
  uninstall,
  renderLinuxDesktop,
  renderMacAppleScript,
  renderPosixLauncher,
  renderWindowsLauncher,
  windowsInstallCommands,
  windowsOpenCommand,
  winQuote
} = require('../../scripts/register-protocol.js') as {
  install: (options: object) => Promise<{ installed: boolean }>;
  macPlistEdits: (plist: string) => string[][];
  protocolPaths: (
    home: string,
    platform: string
  ) => {
    launcher: string;
    desktop: string;
  };
  renderLinuxDesktop: (launcher: string) => string;
  renderMacAppleScript: (launcher: string) => string;
  renderPosixLauncher: (installPath?: string) => string;
  renderWindowsLauncher: () => string;
  status: (options: object) => Promise<{ installed: boolean }>;
  uninstall: (options: object) => Promise<{ removed: boolean }>;
  windowsInstallCommands: (launcher: string) => string[][];
  windowsOpenCommand: (launcher: string) => string;
  winQuote: (value: string) => string;
};

const { version } = require('../../package.json') as { version: string };

describe('register-protocol script helpers', () => {
  it('generates a stable POSIX launcher with a durable CLI and a pinned npx fallback', () => {
    const launcher = renderPosixLauncher("/opt/node's bin:/usr/bin");
    expect(launcher).toContain('command -v git-history-ui');
    expect(launcher).toContain(`npx --yes git-history-ui@${version} --repo-from-url "$1"`);
    expect(launcher).toContain(`PATH='/opt/node'\\''s bin:/usr/bin':"$PATH"`);
    expect(launcher).not.toContain('@latest');
    expect(launcher).not.toContain('node_modules');
  });

  it('generates a macOS AppleScript URL handler and plist edits for the scheme', () => {
    const script = renderMacAppleScript('/Users/Ada "Q" Project/.git-history-ui/bin/protocol-open');
    expect(script).toContain('on open location theURL');
    expect(script).toContain(
      'quoted form of "/Users/Ada \\"Q\\" Project/.git-history-ui/bin/protocol-open"'
    );
    expect(script).toContain('quoted form of theURL');
    const edits = macPlistEdits('/x/Info.plist');
    expect(edits).toContainEqual([
      '-replace',
      'CFBundleIdentifier',
      '-string',
      'io.github.git-history-ui.protocol',
      '/x/Info.plist'
    ]);
    expect(edits.find((e) => e[1] === 'CFBundleURLTypes')?.[3]).toContain('"git-history-ui"');
  });

  it('builds, re-signs and registers the macOS applet, failing loudly on a broken step', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ghui-protocol-mac-'));
    const calls: string[] = [];
    const execFile = (
      command: string,
      _args: string[],
      _options: object,
      callback: (error: Error | null, stdout?: string) => void
    ) => {
      calls.push(path.basename(command));
      callback(command === 'codesign' ? new Error('no codesign') : null, '');
    };
    try {
      await expect(install({ home, platform: 'darwin', execFile })).rejects.toThrow(
        'codesign failed'
      );
      expect(calls).toEqual([
        'osacompile',
        'plutil',
        'plutil',
        'plutil',
        'plutil',
        'plutil',
        'codesign'
      ]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('quotes Linux desktop launcher paths and URL placeholders', () => {
    const desktop = renderLinuxDesktop('/home/Ada Project/.git-history-ui/bin/protocol-open');
    expect(desktop).toContain('Exec="/home/Ada Project/.git-history-ui/bin/protocol-open" %u');
    expect(desktop).toContain('X-Git-History-UI-Owned=true');
  });

  it('quotes Windows protocol command paths and forwards the URL argument', () => {
    const command = windowsOpenCommand(
      'C:\\Users\\Ada Lovelace\\.git-history-ui\\bin\\protocol-open.cmd'
    );

    expect(command).toBe('"C:\\Users\\Ada Lovelace\\.git-history-ui\\bin\\protocol-open.cmd" "%1"');
    const writes = windowsInstallCommands(
      'C:\\Users\\Ada Lovelace\\.git-history-ui\\bin\\protocol-open.cmd'
    );
    expect(writes).toContainEqual([
      'add',
      'HKCU\\Software\\Classes\\git-history-ui',
      '/v',
      'OwnedBy',
      '/d',
      'git-history-ui',
      '/f'
    ]);
    expect(renderWindowsLauncher()).toContain(`npx --yes git-history-ui@${version}`);
    expect(renderWindowsLauncher()).toContain('where git-history-ui.cmd');
  });

  it('escapes embedded quotes in registry command values', () => {
    expect(winQuote('C:\\bad"path\\node.exe')).toBe('"C:\\bad\\"path\\node.exe"');
  });

  it('installs, verifies, and removes only owned Linux artifacts', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ghui-protocol-test-'));
    const execFile = (
      _command: string,
      args: string[],
      _options: object,
      callback: (error: Error | null, stdout?: string) => void
    ) => callback(null, args[0] === 'query' ? 'git-history-ui.desktop\n' : '');
    const options = { home, platform: 'linux', execFile };
    try {
      expect((await install(options)).installed).toBe(true);
      expect((await status(options)).installed).toBe(true);
      const paths = protocolPaths(home, 'linux');
      fs.writeFileSync(paths.desktop, '# user-owned replacement\n', 'utf8');

      await uninstall(options);

      expect(fs.existsSync(paths.launcher)).toBe(false);
      expect(fs.readFileSync(paths.desktop, 'utf8')).toBe('# user-owned replacement\n');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
