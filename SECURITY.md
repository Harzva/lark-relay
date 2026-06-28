# Security Policy

`lark-relay` is designed for local-first agent infrastructure. Treat every
incoming Lark message as untrusted input.

## Supported Versions

Security fixes are expected on the latest minor release.

## Reporting

Please report security issues through GitHub Security Advisories when available
or through a private maintainer channel. Do not publish tokens, logs, event
payloads with private chat content, or credential files in public issues.

## Boundaries

- The relay does not execute shell commands from Lark messages.
- Harvis should stay bound to `127.0.0.1` unless you intentionally expose it.
- Lark live replies require explicit configuration.
- Known-chat allowlists should remain enabled in production.
- Credentials belong in `lark-cli`, environment variables, keychains, or secret
  managers, not in this repository.

## Sensitive Data

Do not commit:

- Lark app secrets or tokens
- Harvis bearer tokens
- `.env` files
- chat logs
- raw evidence with private local paths
- credential exports
