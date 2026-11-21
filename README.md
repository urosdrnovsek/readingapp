# Reading app

A tablet and web reader for children. Its library contains 618 reviewed passages in eight languages from Text Generator.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

For installation and offline testing, run `npm run build` followed by `npm run preview`. Open the preview on localhost and wait for **Ready offline** before disconnecting. Deploy the contents of `dist/` on HTTPS when testing installation on a tablet. On iPad, open in Safari and choose **Add to Home Screen** from the share menu. On Android Chrome, use **Install app** when offered.

The interface is available in English and Slovenian. Choose any of the eight passage languages from the library. Personal reading preferences, progress and highlights live in the browser. **Guest reading** starts a temporary session.

**Listen** reads a word or sentence using an installed device voice that matches the passage language. If the device has no matching local voice, it shows a message and the text remains available.

Open **Paint words** to pick a colour and mark a word with a tap or a phrase with a swipe. **Choose words** offers the same controls by keyboard or screen reader. Colours are saved with the passage, and the palette includes an eraser and undo.

Use the [tablet test checklist](docs/tablet-test.md) for the first test. To compare the bundled library with the pinned Text Generator revision, run `npm run check:content -- /path/to/textgenerator`.

[Read the app blueprint](docs/reading-app-blueprint.md) · [Browse the passage library](content/)
