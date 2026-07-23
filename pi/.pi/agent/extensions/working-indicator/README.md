# Pi working indicator

Uses [`cli-spinners`](https://github.com/sindresorhus/cli-spinners) for Pi's streaming working indicator.

## Commands

- `/spinner-gallery [filter]` — browse animated previews and press Enter to choose
- `/spinner [name]` — choose directly
- `/spinner` — show the current choice
- `/spinner reset` — restore Pi's built-in spinner
- `/verb` — inspect the active verb and mode
- `/verb cycle` — rotate verbs every 1.8 seconds while working (the default)
- `/verb [name]` — pin one verb
- `/verb next` — pin the next verb
- `/verb reset` — restore Pi's `Working…` message

Cycling runs continuously while Pi is thinking or executing a task, advancing
to the next verb every 1.8 seconds and stopping when the agent settles. Hold
**Option** to reveal the active verb's English meaning with a
left-to-right shimmer. Release Option to return to the ancient word. If the
terminal does not report a bare Option press, use **Option+V** to toggle the
translation.

The selected spinner and verb are persisted in `config.json`.

## Install dependencies

```bash
cd ~/.dotfiles/pi/.pi/agent/extensions/working-indicator
npm ci
```

Then run `/reload` in Pi or restart it.
