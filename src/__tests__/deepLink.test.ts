import { deepLinkBrowserTarget, parseDeepLink, serializeDeepLink } from '../deepLink';

describe('portable deep links', () => {
  it('round-trips history, compare, and wrapped state while stripping credentials', () => {
    const history = serializeDeepLink({
      repo: 'https://user:secret@github.com/acme/widgets.git',
      view: 'history',
      commit: 'abcdef1',
      pr: '42',
      branch: 'main',
      author: 'Ada',
      search: 'retry',
      file: 'src/api.ts',
      since: '2026-01-01',
      until: '2026-02-01',
      searchMode: 'nl',
      mode: 'grouped',
      activeFile: 'src/api.ts'
    });
    expect(history).not.toContain('secret');
    expect(parseDeepLink(history)).toMatchObject({
      repo: 'https://github.com/acme/widgets',
      view: 'history',
      commit: 'abcdef1',
      pr: '42',
      searchMode: 'nl',
      mode: 'grouped'
    });

    const compare = parseDeepLink(
      serializeDeepLink({
        repo: 'git@gitlab.com:acme/widgets.git',
        view: 'compare',
        from: 'release/1.x',
        to: 'main',
        activeFile: 'src/a.ts'
      })
    );
    expect(deepLinkBrowserTarget(compare!)).toEqual({
      path: '/compare',
      query: new URLSearchParams('activeFile=src%2Fa.ts&from=release%2F1.x&to=main')
    });

    expect(
      parseDeepLink(
        serializeDeepLink({
          repo: 'https://github.com/acme/widgets',
          view: 'wrapped',
          year: '2026',
          author: 'Grace',
          template: 'classic',
          palette: 'aurora'
        })
      )
    ).toMatchObject({ view: 'wrapped', year: '2026', template: 'classic', palette: 'aurora' });
  });

  it('supports legacy repo, at, and pr links', () => {
    expect(
      parseDeepLink(
        'git-history-ui://open?repo=git%40github.com%3Aacme%2Fwidgets.git&at=abcdef1&pr=7'
      )
    ).toMatchObject({
      v: 1,
      view: 'history',
      repo: 'https://github.com/acme/widgets',
      at: 'abcdef1',
      pr: '7'
    });
  });

  it('rejects malformed versions, views, remotes, and credentials-only paths', () => {
    expect(parseDeepLink('not a url')).toBeNull();
    expect(parseDeepLink('git-history-ui://open?v=2&repo=https://github.com/a/b')).toBeNull();
    expect(
      parseDeepLink('git-history-ui://open?v=1&repo=https://github.com/a/b&view=admin')
    ).toBeNull();
    expect(parseDeepLink('git-history-ui://open?repo=file:///private/repo')).toBeNull();
  });

  it('drops unknown keys instead of serializing them', () => {
    const parsed = parseDeepLink(
      'git-history-ui://open?v=1&repo=https://github.com/a/b&view=history&token=secret'
    );
    expect(parsed).not.toHaveProperty('token');
    expect(serializeDeepLink(parsed!)).not.toContain('token');
  });
});
