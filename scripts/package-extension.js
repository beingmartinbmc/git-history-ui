#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { checkExtension, RUNTIME_FILES } = require('./check-extension');

const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'apps', 'chrome-extension');
const { manifest } = checkExtension(extension);
const outputDir = path.join(root, 'dist', 'extension');
const archive = path.join(outputDir, `git-history-ui-chrome-${manifest.version}.zip`);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ghui-extension-'));

try {
  for (const file of RUNTIME_FILES) {
    const target = path.join(stage, file);
    fs.copyFileSync(path.join(extension, file), target);
    fs.utimesSync(target, new Date('1980-01-01T00:00:00Z'), new Date('1980-01-01T00:00:00Z'));
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(archive, { force: true });
  const zipped = spawnSync('zip', ['-X', '-q', archive, ...RUNTIME_FILES], {
    cwd: stage,
    env: { ...process.env, TZ: 'UTC' },
    stdio: 'inherit'
  });
  if (zipped.status !== 0) throw new Error('zip command failed');
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(`${archive}.sha256`, `${checksum}  ${path.basename(archive)}\n`, 'utf8');
  console.log(archive);
  console.log(`${archive}.sha256`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
