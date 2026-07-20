# Local image attachments

A customized Pi extension for compact draft attachments and tmux-safe image previews.

## Draft workflow

Image paths pasted into the editor become compact placeholders:

```text
[Image 1] [Image 2]
```

Deleting a placeholder drops that attachment. On submit, remaining placeholders stay in the message and their images are attached in placeholder order.

## Preview controls

- `Ctrl+Shift+I` or `/image-preview` — expand/collapse the selected image below the editor
- `Ctrl+Shift+Right` or `/image-next` — next image
- `Ctrl+Shift+Left` or `/image-prev` — previous image

After an image placeholder, typing `/` opens Pi's full slash-command menu. The selected command runs on its own, then the image draft is restored instead of being sent to the model.

The preview uses Kitty Unicode placeholders wrapped for tmux passthrough.

## Attribution

Adapted from [`rielj/pi-image-preview`](https://github.com/rielj/pi-image-preview), MIT licensed. The original license is retained in `LICENSE`.
