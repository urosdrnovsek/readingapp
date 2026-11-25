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

**Listen** on the marker tray reads and underlines the current sentence. For word-by-word listening and speed controls, open **Listen** in **Reading tools**. Both use a matching installed device voice.

The **Markers** tray starts in **Read** mode, so you can scroll. Tap **Draw** to use the colours on small screens, then draw over the words or sketch below the story. Repeated passes deepen the colour. Tap **Read** to scroll again. In **Reading tools**, **Choose words** lets readers place word highlights by keyboard or screen reader. Open **Try this** on selected passages for a short drawing prompt.

Tap a heart to save a passage to **Favourites**, which brings together saved titles across all languages. Reading times are rough estimates based on 100 words per minute. Favourites, drawings and highlights are saved on the device.

Passage thumbnails use the illustrations paired with each text in the pinned Text Generator snapshot.

Use the [tablet test checklist](docs/tablet-test.md) for the first test. To compare the bundled library with the pinned Text Generator revision, run `npm run check:content -- /path/to/textgenerator`.

[Read the app blueprint](docs/reading-app-blueprint.md) · [Browse the passage library](content/)
