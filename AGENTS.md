# Repository Guidelines

## Project Structure & Module Organization
TypeScript sources live in `src/`, with `context.ts` orchestrating Chrome DevTools sessions and focused command handlers in `src/commands/`. Keep new CLI verbs alongside peers such as `src/commands/pages.ts`, and route NDJSON formatting through `src/output.ts`. Compiled artifacts belong in `build/`; never edit them manually. Utility build scripts sit in `scripts/`, and Vitest assets are grouped in `tests/` (`tests/unit` for specs, `tests/fixtures` for recorded protocol payloads, `tests/mocks` for WebSocket and fetch shims). Retain this layout so automated scripts and docs stay accurate.

## Build, Test, and Development Commands
- `npm run build`: cleans, compiles TypeScript to `build/`, and marks the CLI entry executable.
- `npm start`: rebuilds and launches `build/index.js` against a running Chrome with remote debugging.
- `npm run clean`: removes build output; run before regenerating artifacts that must stay in sync.
- `npm test`: executes the Vitest suite once; use `npm run test:watch` while iterating locally.
- `npm run test:coverage`: produces c8 coverage output; keep line/function coverage above 80%.

## Coding Style & Naming Conventions
Follow the existing strict TypeScript configuration (`tsconfig.json`) and NodeNext module style. Use two-space indentation, prefer named exports, and keep filenames kebab-cased (e.g., `network.ts`, `make-executable.mjs`). Public command names should remain dash-separated to align with yargs command aliases, while internal symbols stay camelCase. Before submitting, ensure `npm run build` passes without type or lint warnings; it doubles as the canonical type check.

## Testing Guidelines
Tests rely on Vitest plus the mocks in `tests/mocks`. Co-locate new specs under `tests/unit/<feature>.test.ts` and import shared helpers from `tests/helpers.ts`. When adding fixtures, store protocol transcripts in `tests/fixtures` so they can be reused across suites. Aim to preserve the documented 80%+ coverage by running `npm run test:coverage`, and update snapshots or mocks consciously to avoid masking regressions.

## Commit & Pull Request Guidelines
Existing history uses concise, descriptive summaries (`Initial release v1.0.0`); continue that convention with imperative, one-line subjects (e.g., `Add network throttling command`). Reference related issues in the body, and call out user-facing CLI changes with sample NDJSON lines when helpful. Pull requests should include: a short problem statement, testing done (`npm test`, coverage runs), and any manual Chrome sessions or screenshots that validate behavior. Flag backwards-incompatible changes prominently so downstream automation can adapt.

## Agent-Specific Tips
Ensure Chrome runs with `--remote-debugging-port=9222` before local trials. When scripting workflows, treat every CLI line as standalone JSON—trim empty lines and parse incrementally to keep agents stable on large streams.
