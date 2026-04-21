# Contributing

Thanks for your interest in improving `chat-me`.

## Development setup

1. Install dependencies:

```bash
npm install
```

2. Prepare env file:

```bash
cp .env.example .env
```

3. Export env variables in your shell:

```bash
set -a
source .env
set +a
```

4. Run migrations and seed:

```bash
npm run migrate
npm run seed
```

5. Start services you need:

```bash
npm run dev:api
npm run dev:admin
npm run dev:widget
```

## Before opening a PR

- Keep changes scoped and focused.
- Run:

```bash
npm run check
```

- Update docs/examples when behavior changes.

## Branching and PRs

- Create a branch from `main`.
- Use clear commit messages.
- Open a PR with:
  - what changed
  - why it changed
  - how it was tested

## Reporting issues

When filing a bug, include:
- environment (OS, Node version)
- reproduction steps
- expected vs actual behavior
- relevant logs/screenshots
