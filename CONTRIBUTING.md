# Contributing to Purus VS Code Extension

Thank you for your interest in contributing!

[日本語版はこちら](https://github.com/puruslang/vscode-extension/blob/main/CONTRIBUTING-ja.md)

## About

VS Code language support for Purus.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) (pinned in `packageManager`; `corepack enable` works)
- [Git](https://git-scm.com/)

## Getting Started

```sh
git clone https://github.com/puruslang/vscode-extension.git
cd vscode-extension
pnpm install
pnpm run package
```

## Development

| Command | Description |
|---|---|
| `pnpm run build` | Bundle `src/` with tsdown into `dist/extension.cjs` |
| `pnpm run typecheck` / `lint` / `format:check` | TypeScript 6, ESLint, Prettier |
| `pnpm run test` | Vitest (the analyzer and tokenizer have no VS Code dependency; the extension entry is tested with a mocked `vscode`) |
| `pnpm run package` | Build the .vsix |
| `pnpm run publish` | Publish to the Marketplace (`VSCE_PAT`) |

## Submitting Pull Requests

1. Fork the repository and create a branch from `main`
2. Make your changes
3. Run tests and ensure they pass
4. Open a PR with a clear description

## Release

Releases are triggered by the "Publish VS Code Extension" workflow (manual, with a version bump) or by pushing a `v*` tag (e.g., `v1.1.0`).

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).