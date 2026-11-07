import { canonicalizeRemoteUrl, getRepositoryIdentity } from '../backend/repositoryIdentity';

describe('repository identity', () => {
  test.each([
    ['https://user:token@github.com/acme/widgets.git', 'https://github.com/acme/widgets'],
    ['git@github.com:acme/widgets.git', 'https://github.com/acme/widgets'],
    ['ssh://git@gitlab.com/acme/tools/widgets.git', 'https://gitlab.com/acme/tools/widgets'],
    ['git+https://github.com/acme/widgets.git', 'https://github.com/acme/widgets']
  ])('canonicalizes credential-free remotes', (input, expected) => {
    expect(canonicalizeRemoteUrl(input)).toBe(expected);
  });

  test.each(['', 'not a url', 'file:///tmp/private', 'https://example.com/acme/widgets'])(
    'rejects missing, malformed, or unsupported remotes',
    (input) => expect(canonicalizeRemoteUrl(input)).toBeNull()
  );

  it('returns portable identity fields without a local path', async () => {
    const values = new Map([
      ['remote get-url origin', 'git@github.com:acme/widgets.git\n'],
      ['symbolic-ref --quiet --short HEAD', 'feature/demo\n'],
      ['symbolic-ref --quiet --short refs/remotes/origin/HEAD', 'origin/main\n'],
      ['for-each-ref --format=%(refname:short) refs/heads', 'feature/demo\nmain\n'],
      ['rev-parse --show-toplevel', '/private/work/widgets\n'],
      ['config --get user.name', 'Ada\n'],
      ['config --get user.email', 'ada@example.com\n']
    ]);
    const identity = await getRepositoryIdentity(
      { cwd: '/private/work/widgets', runRaw: async () => '' },
      async (args) => {
        const value = values.get(args.join(' '));
        if (value === undefined) throw new Error('missing');
        return value;
      }
    );

    expect(identity).toEqual({
      name: 'widgets',
      remoteUrl: 'https://github.com/acme/widgets',
      webUrl: 'https://github.com/acme/widgets',
      currentBranch: 'feature/demo',
      defaultBranch: 'main',
      currentAuthor: { name: 'Ada', email: 'ada@example.com' }
    });
    expect(JSON.stringify(identity)).not.toContain('/private/work');
  });

  it('handles repositories with no usable remote', async () => {
    const identity = await getRepositoryIdentity(
      { cwd: '/private/work/local-only', runRaw: async () => '' },
      async (args) => {
        if (args[0] === 'rev-parse') return '/private/work/local-only\n';
        if (args[0] === 'for-each-ref') return 'main\n';
        throw new Error('not configured');
      }
    );
    expect(identity).toMatchObject({
      name: 'local-only',
      remoteUrl: null,
      webUrl: null,
      defaultBranch: 'main',
      currentAuthor: { name: null, email: null }
    });
  });

  describe('ssh_config aliases and explicit override', () => {
    const run =
      (values: Record<string, string>) =>
      async (args: string[]): Promise<string> => {
        const value = values[args.join(' ')];
        if (value === undefined) throw new Error('missing');
        return value;
      };
    const git = { cwd: '/private/work/widgets', runRaw: async () => '' };

    it('resolves an ssh alias to the real host', async () => {
      const identity = await getRepositoryIdentity(
        git,
        run({ 'remote get-url origin': 'git@github-personal:acme/widgets.git\n' }),
        async (alias) => (alias === 'github-personal' ? 'github.com' : null)
      );
      expect(identity.remoteUrl).toBe('https://github.com/acme/widgets');
      expect(identity.name).toBe('widgets');
    });

    it('stays null when the alias resolves to an unsupported host', async () => {
      const identity = await getRepositoryIdentity(
        git,
        run({ 'remote get-url origin': 'git@corp-alias:acme/widgets.git\n' }),
        async () => 'git.internal.example'
      );
      expect(identity.remoteUrl).toBeNull();
    });

    it('never asks ssh to resolve a plain https host', async () => {
      const resolve = jest.fn(async () => 'github.com');
      const identity = await getRepositoryIdentity(
        git,
        run({ 'remote get-url origin': 'https://example.com/acme/widgets\n' }),
        resolve
      );
      expect(identity.remoteUrl).toBeNull();
      expect(resolve).not.toHaveBeenCalled();
    });

    it('honors git-history-ui.remoteUrl over origin', async () => {
      const identity = await getRepositoryIdentity(
        git,
        run({
          'config --get git-history-ui.remoteUrl': 'git@github.com:acme/canonical.git\n',
          'remote get-url origin': 'git@mystery:acme/widgets.git\n'
        }),
        async () => null
      );
      expect(identity.remoteUrl).toBe('https://github.com/acme/canonical');
    });
  });
});
