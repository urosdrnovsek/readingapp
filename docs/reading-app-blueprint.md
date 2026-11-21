# Reading app blueprint

A child should be able to open a story, make one change that helps them read it, and come back to the same sentence tomorrow. A teacher or parent can set up the page alongside the child. Start with one installable web app for iPad, Android tablets and desktop browsers. The first release should work offline after the library has been saved on the device.

## A first reading session

1. **Choose a passage.** The library offers **Continue reading** when there is a saved place. To start something new, choose a passage language, then browse by title, theme or level. Show language names in their own language, and keep the choice of interface language separate. Each result shows the title, theme and level. Levels 1–5 describe the texts and children can choose freely among them.
2. **Open a quiet reading page.** Start with left-aligned plain text at 24 CSS pixels, 1.6 line height and a column up to 55 characters wide. Make **Highlight** and **Guide** reachable with one tap. **Reading tools** opens a panel where a child or adult can try a change against the current sentence and return to the same place.
3. **Pause or finish.** Leaving the page saves the current sentence and highlights on this device. **Finish** returns to the same library filters. A finished passage can be opened and read again.

Here is the tablet layout using a level-one English passage from the library.

```text
‹ Library                             Reading tools

A Woven Nest

A bird carries a strip of grass in its beak.
It loops the strip around a twig. More grass
makes a nest. The bird works one piece at a time.

Highlight                Guide               Finish
```

The passage flows when the tablet rotates, the browser zooms or the child enlarges the type. The toolbar wraps at narrow widths and stays clear of the final line. On a wide screen, keep a comfortable reading column and use the space beside it for the tools panel.

## Reading tools

| Tool | What the child can do |
| --- | --- |
| Highlight a word or phrase | Tap **Highlight**, then tap a word. Choose **Save** for one word, or tap the last word before saving a phrase. A swipe scrolls the page. Show the pending range as the child adjusts it. Provide **Cancel**, **Remove** and **Undo**. A list of saved highlights provides another way to find or remove a mark. |
| Colour syllables | Alternate two high-contrast text colours at the passage's supplied syllable breaks, starting again at each word. Offer visible boundary ticks for a child who prefers a shape cue. Switching the tool off restores ordinary text immediately. |
| Distinguish letters | Let the reader choose `b` and `d` independently, add `p` and `q`, or select another letter. Start with the familiar worksheet colours (red **b**, green **d**, violet **p**, amber **q**). Offer distinct underlines, such as single for **b** and double for **d**, and an option to include uppercase forms. Preview the result in a real word. |
| Follow a sentence | **Guide** places a bar beside the current sentence. **Previous** and **Next** move it one sentence at a time. The rest of the passage remains legible. |
| Adjust the page | Change type size, font, line height, letter and word spacing, and page tint. Preview each change in place. **Plain text** turns off the visual aids in one action and keeps saved highlights available for later. |

**How the tools work together.** In the first sentence of *A Woven Nest*, a child might mark *bird carries*. The saved mark supplies a background. In *bird*, the selected letter cues apply to the **b** and **d**. In *carries*, the ink changes at *car·ries*. A selected letter takes precedence over syllable ink on that letter alone. The guide uses the margin. Copying the phrase or listening with a screen reader gives “bird carries”. [English passage pack](../content/en.json) · [Worksheet letter colours](https://github.com/urosdrnovsek/textgenerator/blob/5504627c69f04c27b9f6c56dee509792cf5920d6/src/config.js#L276-L280)

## Which texts belong in the library

Use the entries that meet **both** conditions at the same Text Generator revision. The language is registered and its pack is bundled from `content/<language>.json`. The entry carries `review.status == "reviewed"`. This makes “accepted and used” reproducible when the library is refreshed. At source revision `5504627`, the generator bundles 668 entries, including 50 Slovenian drafts. The intersection gives these 618 passages. [Upstream pack build](https://github.com/urosdrnovsek/textgenerator/blob/5504627c69f04c27b9f6c56dee509792cf5920d6/scripts/build.mjs#L50-L64) · [Upstream review status definitions](https://github.com/urosdrnovsek/textgenerator/blob/5504627c69f04c27b9f6c56dee509792cf5920d6/docs/content-guide.md#review-provenance)

| Passage language | Pack | Accepted passages |
| --- | --- | ---: |
| Croatian | hr | 75 |
| English | en | 118 |
| French | fr | 75 |
| German | de | 75 |
| Romanian | ro | 75 |
| Slovak | sk | 75 |
| Slovenian | sl | 50 |
| Spanish | es | 75 |
| **Total** | | **618** |

Each language covers five levels in each of five themes. The themes are stories, animal facts, around the world, amazing science, and nature and seasons. Keep the source order, IDs, versions, titles, text, syllable boundaries and review records. The raw `Texts collection/` is an upstream authoring pool and falls outside the bundled library.

All 618 marked-up passages reproduce their plain text exactly when `|` is stripped. Text Generator records a separate syllable review for 568. Its 50 accepted Slovenian passages include authored divisions with `syllablesReviewed: false`. Use those divisions when the reader enables syllables, and make their review status available in the adult-facing tools. [Passage packs](../content/)

## Implementation design

- **Delivery and offline reading.** Build a static TypeScript progressive web app with semantic HTML and CSS. The same URL opens in iPad Safari, Android Chrome and desktop browsers. Support adding it to the Home Screen on iPad and installing it where Android offers installation. The eight JSON packs together are about 1 MB, so a service worker can save the app and the whole library together. Show **Ready offline** after every required file is cached. Activate an update only when its complete set is available, between reading sessions.
- **Passage rendering.** Use `body` as the text displayed, selected and spoken. Derive syllable boundaries from `syllable_body` and positions for words and sentences from the passage language. Split visual spans only at the boundaries needed by active tools. Draw guide bars, underlines and ticks as decoration. Keep the passage in natural reading order and set its HTML `lang` to the passage language.
- **Progress and highlights.** Store the language, entry ID and entry version with each bookmark or highlight in IndexedDB. Anchor to offsets in the original body (UTF-16, start inclusive and end exclusive), snapped to whole words for marking. Save the selected quotation with each mark. After a passage changes version, reattach a mark only when its quotation matches unambiguously at word boundaries. Keep an unmatched quotation in saved highlights. This also lets the reader change font size or orientation without moving a mark.
- **Personal and shared tablets.** Remember display preferences and reading progress on this browser. Offer **Guest reading** on a shared tablet, with temporary marks and an explicit **End session**. The adult tools can clear saved reading data. All passage rendering and annotation work on the device.
- **Content refresh.** Pin the upstream revision, enumerate the registered packs, apply the two inclusion conditions, and keep the text fields and review provenance. Compare the resulting language-and-ID set, versions, exact bodies and syllable round trips with the pinned source before replacing the snapshot. Retire entries that lose their reviewed status. Versioned marks allow a corrected passage to replace an older one safely.

## Accessibility and acceptance

Design for touch, keyboards, switches and screen readers from the first reader screen. Aim for WCAG 2.2 AA, with 48 × 48 CSS pixel touch targets, visible focus, 4.5:1 text contrast in the supported colour combinations and 3:1 contrast for essential control boundaries and focus indicators. Allow browser zoom and text reflow. Expose the highlighter's start and end word as labelled controls that can each be adjusted one word at a time. Ordinary reading has one continuous passage with standard screen-reader navigation.

| Test on a real device | Passing result |
| --- | --- |
| iPad Safari, touch and VoiceOver | Open **A Woven Nest**, highlight “bird carries” and switch on syllables and letter cues. VoiceOver reads the sentence once in order. With touch or VoiceOver, the child can save the same phrase and undo removal. |
| Android Chrome, touch and TalkBack | Open a Slovenian passage, enable syllables, enlarge the text and rotate the tablet. The selected sentence and saved phrase survive reflow. Slovenian diacritics copy exactly. |
| Desktop browser, keyboard only | Choose a passage, mark a multiword phrase, adjust its ends, erase it, undo and return to the library with visible focus throughout. Repeat at large text size and a 320 CSS pixel reading width. |
| Offline restart | After **Ready offline**, close the app, disconnect and reopen it. A passage in each language opens, and the saved place and highlights return. An interrupted update leaves the last complete library usable. |

## Build order

1. **Library and plain reader.** Ship an internal build with the accepted packs, language/theme/level selection and a readable passage view. Check the available IDs against the pinned upstream snapshot. Try one short and one long passage on each tablet.
2. **Reading supports.** Deliver the highlighter, syllable and letter cues, sentence guide and appearance settings. Use “bird carries” to exercise overlapping cues, then check accented text and a level-five passage in every language.
3. **Classroom pilot.** Add resume, guest sessions, installation and offline updates. Run the device checks above. With a child and a teacher, observe whether the child can find a text, mark a phrase, turn off a distracting aid and resume the next day.

After the pilot, the first extension to try is tap-to-hear a word or sentence. Offer it for languages with a matching device voice, with replay, speed and stop controls. The pilot can show whether children want that support while reading independently.
