# Operations

## macOS LaunchAgent

Use the template in `examples/com.harzva.lark-relay.plist`.

```bash
mkdir -p ~/Library/LaunchAgents
cp examples/com.harzva.lark-relay.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.harzva.lark-relay.plist
launchctl kickstart -k gui/$(id -u)/com.harzva.lark-relay
```

Logs should go to a local private directory, not to a public repository.

## Linux systemd

Use the template in `examples/lark-relay.service`.

```bash
mkdir -p ~/.config/systemd/user
cp examples/lark-relay.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now lark-relay
```

## Health Checks

```bash
lark-relay check --config /path/to/lark-relay.config.json
lark-relay route-file --config /path/to/lark-relay.config.json --file examples/mobilecode-evidence-event.json --no-reply
```

## Upgrade

```bash
npm install -g @harzva/lark-relay@latest
lark-relay check --config /path/to/lark-relay.config.json
```
