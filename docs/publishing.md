# Publishing

## GitHub

```bash
git status --short --branch
npm run check
npm test
npm pack --dry-run
git push origin main
```

## npm

The package is designed for npm distribution, but publishing requires a scoped
package owner with npm permissions.

```bash
npm login
npm whoami
npm publish --access public
```

Before publishing, verify:

- `package.json` version is bumped.
- `npm pack --dry-run` contains only public-safe files.
- No tokens, cookies, chat logs, `.env` files, or private local paths are in the
  package.
- README install commands match the published package name.

## Versioning

Use semver:

- Patch: bug fixes and docs.
- Minor: new payload types, endpoints, or CLI options.
- Major: breaking config or protocol changes.
