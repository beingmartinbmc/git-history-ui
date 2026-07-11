#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveRefs(inputs, event) {
  const explicitBase = cleanRef(inputs.base);
  const explicitHead = cleanRef(inputs.head);
  if (explicitBase && explicitHead) return { base: explicitBase, head: explicitHead };
  const payload = event || {};
  const derived =
    payload.pull_request
      ? { base: payload.pull_request.base && payload.pull_request.base.sha, head: payload.pull_request.head && payload.pull_request.head.sha }
      : payload.merge_group
        ? { base: payload.merge_group.base_sha, head: payload.merge_group.head_sha }
        : { base: payload.before, head: payload.after };
  const base = explicitBase || cleanRef(derived.base);
  const head = explicitHead || cleanRef(derived.head);
  if (!base || !head) {
    throw new Error(
      'Could not resolve base/head. Set action inputs explicitly or run from pull_request, merge_group, or push.'
    );
  }
  return { base, head };
}

function cleanRef(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 200 && !trimmed.startsWith('-') && !/[\0\r\n]/.test(trimmed)
    ? trimmed
    : '';
}

function readEvent(file) {
  if (!file) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resolveSafePath(value, fallback) {
  const selected = value || fallback;
  if (typeof selected !== 'string' || /[\0\r\n]/.test(selected)) {
    throw new Error('Action paths must not contain control characters');
  }
  return path.resolve(selected);
}

function runCli(args, cwd, spawn = spawnSync) {
  const result = spawn('npx', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'git-history-ui pr-impact failed').trim());
  }
  return result.stdout.trim();
}

function appendFile(file, content) {
  if (file) fs.appendFileSync(file, content, 'utf8');
}

function runAction(env = process.env, spawn = spawnSync) {
  const event = readEvent(env.GITHUB_EVENT_PATH);
  const refs = resolveRefs({ base: env.INPUT_BASE, head: env.INPUT_HEAD }, event);
  const format = env.INPUT_FORMAT === 'json' ? 'json' : 'markdown';
  const version = env.INPUT_CLI_VERSION || 'latest';
  if (!/^(?:latest|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.test(version)) {
    throw new Error('cli-version must be latest or a semantic version');
  }
  const cwd = resolveSafePath(env.INPUT_WORKING_DIRECTORY, process.cwd());
  const output = resolveSafePath(
    env.INPUT_OUTPUT,
    path.join(
      env.RUNNER_TEMP || os.tmpdir(),
      `git-history-ui-pr-impact.${format === 'json' ? 'json' : 'md'}`
    )
  );
  const common = [
    '--yes',
    `git-history-ui@${version}`,
    '--cwd',
    cwd,
    'pr-impact',
    '--base',
    refs.base,
    '--head',
    refs.head
  ];
  runCli([...common, '--format', format, '--output', output], cwd, spawn);

  let jsonPath = output;
  if (format !== 'json') {
    jsonPath = path.join(env.RUNNER_TEMP || os.tmpdir(), `git-history-ui-pr-impact-${process.pid}.json`);
    runCli([...common, '--format', 'json', '--output', jsonPath], cwd, spawn);
  }
  const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (jsonPath !== output) fs.rmSync(jsonPath, { force: true });

  const summary =
    format === 'markdown'
      ? fs.readFileSync(output, 'utf8')
      : `## git-history-ui PR impact\n\n\`${report.summary.commits}\` commits · \`${report.summary.files}\` files · \`+${report.summary.additions} / -${report.summary.deletions}\`\n`;
  appendFile(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  appendFile(
    env.GITHUB_OUTPUT,
    `report-path=${output}\nfiles-changed=${report.summary.files}\ntotal-churn=${report.summary.additions + report.summary.deletions}\n`
  );
  return { refs, output, report };
}

if (require.main === module) {
  try {
    const result = runAction();
    console.log(result.output);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { cleanRef, readEvent, resolveRefs, resolveSafePath, runAction };
