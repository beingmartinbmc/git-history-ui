const { windowsOpenCommand, winQuote } = require('../../scripts/register-protocol.js') as {
  windowsOpenCommand: (nodePath: string, cliPath: string) => string;
  winQuote: (value: string) => string;
};

describe('register-protocol script helpers', () => {
  it('quotes Windows protocol command paths and forwards the URL argument', () => {
    const command = windowsOpenCommand(
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Users\\Ada Lovelace\\AppData\\Roaming\\npm\\node_modules\\git-history-ui\\dist\\cli.js'
    );

    expect(command).toBe(
      '"C:\\Program Files\\nodejs\\node.exe" ' +
        '"C:\\Users\\Ada Lovelace\\AppData\\Roaming\\npm\\node_modules\\git-history-ui\\dist\\cli.js" ' +
        '--repo-from-url "%1"'
    );
  });

  it('escapes embedded quotes in registry command values', () => {
    expect(winQuote('C:\\bad"path\\node.exe')).toBe('"C:\\bad\\"path\\node.exe"');
  });
});
