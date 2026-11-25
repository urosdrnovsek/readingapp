# Deploy Reading Room (bralna soba)

Publish the app at `https://urosedu.com/bralna-soba/`. Use the exact title **Reading Room (bralna soba)** on the page and in the browser tab. Add it to the site navigation.

Match the colours, typography, spacing, and navigation of urosedu.com. Keep the passage text prominent and the drawing toolbar compact. Preserve the illustrated library, the 618 reviewed passages across eight languages, and the reading and accessibility tools.

## Build

Use Node.js 22.12 or newer.

```sh
npm ci
npm run build
```

Make design changes in source and rebuild. Serve the contents of `dist/` over HTTPS under `/bralna-soba/`. Redirect `/bralna-soba` to `/bralna-soba/` so relative assets load correctly. Let browsers revalidate `sw.js` and keep its scope under `/bralna-soba/`. Release the build files together and preserve their contents, since the offline worker verifies their hashes.

## Verify

Open the app from the site navigation in a signed-out browser. Check the title and layout on mobile and desktop. Open `/bralna-soba/#read/en/animal_facts_weaverbird_1`, wait for **Ready offline**, then disconnect and reopen the passage. Check touch scrolling, drawing, saved favourites, the interface language selector, and read-aloud with a matching installed voice. The production domain has its own browser storage.

[Private pilot for visual reference](https://reading-room-pilot.blossomingchip1.chatgpt.site) · [Tablet test checklist](docs/tablet-test.md)
