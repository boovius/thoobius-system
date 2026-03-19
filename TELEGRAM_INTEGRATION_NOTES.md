# TELEGRAM_INTEGRATION_NOTES.md

## Current state

- Telegram bot is already configured and healthy in OpenClaw.
- Bot username: `@vangudy_openclaw_bot`
- Josh / BoovyWoovy successfully paired via Telegram DM.
- Approved Telegram sender ID: `1178408935`

## Follow-up cleanup to implement later

### 1. Make DM access explicit and durable
Current setup works via pairing approval, but a cleaner long-term setup is to explicitly allow Josh's Telegram user ID in config.

Desired direction:
- set Telegram DM policy to an explicit allowlist model if not already done
- include Josh's Telegram sender ID: `1178408935`

Intended outcome:
- Telegram DM access does not depend only on pairing history
- config makes ownership and authorization explicit

### 2. Review group-chat policy
OpenClaw surfaced a warning that Telegram group messages are effectively blocked unless sender allowlists are configured.

Warning summary:
- `channels.telegram.groupPolicy` is `allowlist`
- `groupAllowFrom` and `allowFrom` are empty for group authorization
- result: group messages will be silently dropped

Later decision needed:
- if Josh wants Telegram group use, define group policy explicitly
- either:
  - keep groups locked down
  - or configure allowed groups and allowed senders
  - or use `requireMention` behavior where appropriate

### 3. Optional hardening / polish
Possible future cleanup:
- document Telegram config location and current policy
- verify whether DM policy is `pairing` or `allowlist`
- switch from implicit pairing-only access to explicit owner allowlist
- test reply behavior from Telegram after any config changes

## Testing

Basic DM test message:
- `Thoobius, are you there?`

If Telegram works, it becomes a good continuity channel for resuming work outside webchat.
