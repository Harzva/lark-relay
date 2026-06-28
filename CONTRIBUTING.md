# Contributing

Thanks for helping improve `lark-relay`.

## Development

```bash
npm install
npm run check
npm test
```

## Design Rules

- Keep the CLI installable with `npm`, `npx`, and GitHub source installs.
- Keep the relay transport-only: no model calls and no raw shell execution from
  incoming messages.
- Preserve the no-public-IP design. Harvis should be reachable through local
  host or private network configuration only.
- Add tests for payload parsing, filtering, dedupe, and Harvis routing when
  changing protocol behavior.
- Never add secrets, tokens, raw chat logs, or local private paths to fixtures.

## Release Checklist

```bash
npm run check
npm test
npm pack --dry-run
```
