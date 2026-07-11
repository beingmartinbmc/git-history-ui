#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXTENSION = path.join(ROOT, 'apps', 'chrome-extension');
const RUNTIME_FILES = Object.freeze([
  'content.js',
  'icon-128.png',
  'icon-16.png',
  'icon-48.png',
  'link.js',
  'manifest.json',
  'popup.html',
  'popup.js'
]);

function pngDimensions(file) {
  const data = fs.readFileSync(file);
  if (
    data.length < 24 ||
    data.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
    data.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error(`${path.basename(file)} is not a valid PNG`);
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function checkExtension(directory = EXTENSION) {
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('manifest version must be x.y.z');
  if (JSON.stringify(manifest.permissions || []) !== JSON.stringify(['storage'])) {
    throw new Error('extension permissions must be exactly ["storage"]');
  }
  if (JSON.stringify(manifest.host_permissions || []) !== JSON.stringify(['https://github.com/*'])) {
    throw new Error('host permissions must be limited to GitHub');
  }

  const referenced = new Set([
    manifest.action && manifest.action.default_popup,
    ...Object.values(manifest.icons || {}),
    ...(manifest.content_scripts || []).flatMap((entry) => entry.js || [])
  ]);
  const popup = fs.readFileSync(path.join(directory, manifest.action.default_popup), 'utf8');
  for (const match of popup.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) referenced.add(match[1]);
  for (const file of referenced) {
    if (!file || /^https?:/i.test(file) || !fs.existsSync(path.join(directory, file))) {
      throw new Error(`missing or remote runtime file: ${file}`);
    }
  }
  for (const [size, file] of Object.entries(manifest.icons || {})) {
    const dimensions = pngDimensions(path.join(directory, file));
    if (dimensions.width !== Number(size) || dimensions.height !== Number(size)) {
      throw new Error(`${file} must be ${size}x${size}`);
    }
  }

  const actualRuntime = fs
    .readdirSync(directory)
    .filter((file) => /\.(?:js|html|json|png)$/i.test(file) && !/\.test\.js$/.test(file))
    .sort();
  if (JSON.stringify(actualRuntime) !== JSON.stringify(RUNTIME_FILES)) {
    throw new Error(
      `runtime allowlist mismatch\nexpected: ${RUNTIME_FILES.join(', ')}\nactual: ${actualRuntime.join(', ')}`
    );
  }
  return { manifest, runtimeFiles: [...RUNTIME_FILES] };
}

if (require.main === module) {
  try {
    const result = checkExtension();
    console.log(`Extension check passed (${result.runtimeFiles.length} runtime files).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { checkExtension, pngDimensions, RUNTIME_FILES };
