# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 5.x     | :white_check_mark: |
| 4.x     | :x:                |
| < 4.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in `git-history-ui`, **please do not
open a public issue.** Instead, report it responsibly so we can fix it before
it's disclosed.

**Email:** [ankit.sharma199803@gmail.com](mailto:ankit.sharma199803@gmail.com)

Please include:

- A description of the vulnerability
- Steps to reproduce
- The version(s) affected
- Any potential impact you've identified

You should receive an acknowledgment within **48 hours**. We'll work with you
to understand the issue and coordinate a fix and disclosure timeline.

## Scope

The following are in scope:

- The `git-history-ui` npm package and CLI
- The Express backend server (`src/backend/`)
- API key handling (Anthropic, OpenAI, GitHub tokens)
- The local SQLite index (`~/.git-history-ui/`)
- The Chrome extension ZIP distributed with GitHub releases

The following are **out of scope**:

- Third-party services (Anthropic, OpenAI, GitHub APIs)
- The user's own git repository contents

The Chrome Web Store listing is not currently published; submission and listing
maintenance remain manual distribution work.

## Principles

- **Local-first.** Git processing stays local. If you configure an LLM provider
  and invoke an AI action, selected prompt, commit metadata, and relevant
  diff/history data are sent to that provider.
- **No telemetry.** We do not collect analytics, crash reports, or usage data.
- **API keys are yours.** Keys are read from environment variables and sent
  directly to the provider you chose. They are never logged, stored, or
  transmitted elsewhere.
