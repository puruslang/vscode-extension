# Changelog

Change history for the Purus VS Code extension (`otoneko1102.purus`).

---

## v1.0.0 (2026-06-26)

### Initial Release

First stable release as a standalone repository, migrated from the `otnc/purus` monorepo.

### Features

- **Syntax Highlighting** — full TextMate grammar for `.purus`, `.cpurus`, `.mpurus`
  - Keywords, operators, strings (`///...///` and `//;...;//`), comments, numbers, regex
  - `blank` keyword highlighted as wildcard
- **Snippets** — 30+ code snippets (`fn`, `const`, `if`, `for`, `switch`, `class`, `str`, etc.)
- **File Icons** — custom Purus icon for `.purus`, `.cpurus`, `.mpurus` files
- **Language Configuration** — comment toggle (`--`), auto-close (`[]`, `///`, `//;`), kebab-case word pattern
- **Diagnostics** — real-time linting with error/warning highlights
- **Folding** — indent-based code folding

### Breaking Changes

- **Node.js ≥ 22 required** (for built-in analyzer)