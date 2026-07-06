import { isSafeRepoPath } from '../backend/gitService';

describe('isSafeRepoPath', () => {
  it('accepts simple relative paths', () => {
    expect(isSafeRepoPath('src/app.ts')).toBe(true);
    expect(isSafeRepoPath('README.md')).toBe(true);
    expect(isSafeRepoPath('a/b/c/d.txt')).toBe(true);
  });

  it('rejects null bytes', () => {
    expect(isSafeRepoPath('src/app.ts\0evil')).toBe(false);
  });

  it('rejects Unix absolute paths', () => {
    expect(isSafeRepoPath('/etc/passwd')).toBe(false);
    expect(isSafeRepoPath('/usr/bin/env')).toBe(false);
  });

  it('rejects Windows drive-letter absolute paths', () => {
    expect(isSafeRepoPath('C:\\Windows\\System32\\cmd.exe')).toBe(false);
    expect(isSafeRepoPath('D:/secrets.txt')).toBe(false);
    expect(isSafeRepoPath('c:/etc/passwd')).toBe(false);
    expect(isSafeRepoPath('Z:\\data')).toBe(false);
  });

  it('rejects parent traversal', () => {
    expect(isSafeRepoPath('../../etc/passwd')).toBe(false);
    expect(isSafeRepoPath('src/../../../etc/shadow')).toBe(false);
    expect(isSafeRepoPath('src\\..\\..\\secret')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isSafeRepoPath(null as any)).toBe(false);
    expect(isSafeRepoPath(undefined as any)).toBe(false);
    expect(isSafeRepoPath(42 as any)).toBe(false);
    expect(isSafeRepoPath('' as any)).toBe(false);
  });

  it('allows paths with dots that are not traversal', () => {
    expect(isSafeRepoPath('.gitignore')).toBe(true);
    expect(isSafeRepoPath('src/.env.example')).toBe(true);
    expect(isSafeRepoPath('test/fixtures/file.test.ts')).toBe(true);
  });
});
