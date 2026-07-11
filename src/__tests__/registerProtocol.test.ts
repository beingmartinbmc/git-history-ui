import fs from 'fs';
import os from 'os';
import path from 'path';

const {
  install,
  protocolPaths,
  status,
  uninstall,
  renderLinuxDesktop,
  renderMacLauncher,
  renderMacPlist,
  renderPosixLauncher,
  renderWindowsLauncher,
  windowsInstallCommands,
  windowsOpenCommand,
  winQuote
} = require('../../scripts/register-protocol.js') as {
  install: (options: object) => Promise<{ installed: boolean }>;
  protocolPaths: (
    home: string,
    platform: string
  ) => {
    launcher: string;
    desktop: string;
  };
  renderLinuxDesktop: (launcher: string) => string;
  renderMacLauncher: (launcher: string) => string;
  renderMacPlist: () => string;
  renderPosixLauncher: () => string;
  renderWindowsLauncher: () => string;
  status: (options: object) => Promise<{ installed: boolean }>;
  uninstall: (options: object) => Promise<{ removed: boolean }>;
  windowsInstallCommands: (launcher: string) => string[][];
  windowsOpenCommand: (launcher: string) => string;
  winQuote: (value: string) => string;
};

describe('register-protocol script helpers', () => {
  it('generates a stable POSIX launcher with a durable CLI and npx fallback', () => {
    const launcher = renderPosixLauncher();
    expect(launcher).toContain('command -v git-history-ui');
    expect(launcher).toContain('npx --yes git-history-ui@latest --repo-from-url "$1"');
    expect(launcher).not.toContain('node_modules');
  });

  it('generates macOS plist and app launcher pointing at the stable user launcher', () => {
    const launcher = renderMacLauncher('/Users/Ada Project/.git-history-ui/bin/protocol-open');
    expect(launcher).toContain('exec "/Users/Ada Project/.git-history-ui/bin/protocol-open" "$1"');
    const plist = renderMacPlist();
    expect(plist).toContain('<string>git-history-ui</string>');
    expect(plist).toContain('<string>io.github.git-history-ui.protocol</string>');
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
    expect(renderWindowsLauncher()).toContain('npx --yes git-history-ui@latest');
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
