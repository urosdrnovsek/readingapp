import './style.css';
import { byKey, languages, loadLibrary, passages, themes, type Language, type Passage, type Theme } from './content';
import { defaults, escape, locate, makeAnchor, paintColours, passageMarkup, readStructure, repaint, type Highlight, type PaintColour, type Preferences, type Span } from './reading';
import { emptyData, loadStore, type ReadingData } from './storage';
import { strings, type Message } from './strings';
import { icon } from './icons';
import { createSpeech, speechRates, type SpeechRate } from './speech';
import { appendInkPoint, renderInkCanvas, type InkColour, type InkStroke, type InkSurface } from './drawing';
import pictureData from './passage-pictures.json';

const app = document.querySelector<HTMLDivElement>('#app')!;
const PAGE_SIZE = 12;
let data = emptyData();
let guestData: ReadingData | undefined;
let database: Awaited<ReturnType<typeof loadStore>> | undefined;
let storageError = false;
let offline: Message = 'offlinePreparing';
let preferences = { ...defaults };
let language: Language = 'en';
let theme: Theme | '' = '';
let level = '';
let search = '';
let pageLimit = PAGE_SIZE;
let libraryScroll = 0;
let originCard: string | undefined;
let current: Passage | undefined;
let structure: ReturnType<typeof readStructure> | undefined;
let sentence = 0;
let guide = false;
let toolsOpen = false;
let selecting = false;
let startWord = 0;
let endWord = 0;
let awaitingEnd = false;
let paintOpen = false;
let paintColour: InkColour = 'sun';
let stroke: { pointer: number; canvas: HTMLCanvasElement; ink: InkStroke } | undefined;
let inkFrame = 0;
let dockTap: { pointer: number; control: HTMLButtonElement } | undefined;
let activatedByTouch: HTMLButtonElement | undefined;
let undoStack: ({ marks: Highlight[] } | { strokeCount: number })[] = [];
let scrollFrame = 0;
let ignoreScrollUntil = 0;
let settingTimer: number | undefined;
let listenOpen = false;
let listenMode: 'word' | 'sentence' = 'sentence';
let listenWord = 0;
let hasPlayed = false;
let playback: 'idle' | 'playing' | 'error' = 'idle';
const speech = createSpeech(status => {
  playback = status;
  refreshListening();
  if (listenOpen) updateListeningTarget();
});

const activeData = () => guestData ?? data;
const t = (message: Message) => strings[message][activeData().interfaceLanguage === 'sl' ? 1 : 0];
const heading = () => app.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
const option = (value: string, label: string, selected: string) =>
  `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(label)}</option>`;
const button = (action: string, label: Message, classes = 'button') =>
  `<button type="button" class="${classes}" data-action="${action}">${t(label)}</button>`;
const marks = () => current ? activeData().highlights[current.key] ?? [] : [];
const inkKey = (passage: Passage) => `${passage.key}/${passage.version}`;
const inkStrokes = () => current ? activeData().ink?.[inkKey(current)] ?? [] : [];
const passagePictures: Record<string, string> = pictureData;
const colourLabels: Record<PaintColour, Message> = { sun: 'sun', rose: 'rose', mint: 'mintInk', sky: 'sky', lilac: 'lilac' };
const measureDock = new ResizeObserver(([entry]) => {
  app.style.setProperty('--dock-height', `${entry.target.getBoundingClientRect().height}px`);
});
const measureInk = new ResizeObserver(scheduleInkRender);

function persist() {
  if (!guestData) database?.save(data).catch(() => {
    storageError = true;
    updateStatus();
  });
}

function setPreferences(next: Preferences) {
  preferences = next;
  activeData().preferences = next;
  persist();
  refreshPassage();
}

function saveBookmark() {
  if (!current || !structure?.sentences[sentence]) return;
  const range = structure.sentences[sentence];
  const saved = activeData().bookmark;
  if (saved?.key === current.key && saved.sentence.start === range.start && saved.sentence.version === current.version) return;
  activeData().bookmark = { key: current.key, sentence: makeAnchor(current, range) };
  persist();
}

function showSentence(behavior: ScrollBehavior = 'instant') {
  ignoreScrollUntil = performance.now() + 450;
  app.querySelector(`[data-sentence="${sentence}"]`)?.scrollIntoView({ block: 'center', behavior });
}

function changeSentence(offset: number) {
  if (!structure) return;
  speech.stop();
  sentence = Math.max(0, Math.min(structure.sentences.length - 1, sentence + offset));
  resetListeningTarget();
  saveBookmark();
  refreshPassage();
  showSentence();
}

function route() {
  if (!location.hash.startsWith('#read/')) return;
  try {
    return byKey.get(decodeURIComponent(location.hash.slice(6)));
  } catch {
    return undefined;
  }
}

function openPassage(key: string) {
  if (!byKey.has(key)) return;
  libraryScroll = window.scrollY;
  originCard = key;
  history.pushState(null, '', '#read/' + key);
  showRoute();
}

function closePassage(finished = false) {
  if (finished && current) {
    if (activeData().bookmark?.key === current.key) {
      delete activeData().bookmark;
      persist();
    }
  }
  history.replaceState(null, '', location.pathname + location.search);
  showRoute(finished);
}

function showRoute(finished = false) {
  speech.stop();
  listenOpen = false;
  cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  const previous = current;
  if (!finished) saveBookmark();
  current = route();
  structure = current && readStructure(current);
  guide = selecting = toolsOpen = awaitingEnd = false;
  paintOpen = !!current && !preferences.plain;
  if (paintColour === 'eraser') paintColour = 'sun';
  stroke = undefined;
  undoStack = [];
  sentence = 0;
  if (current && structure) {
    const lastVisited = activeData().bookmark;
    if (lastVisited?.key === current.key) {
      const saved = locate(lastVisited.sentence, current, structure.sentences);
      sentence = Math.max(0, structure.sentences.findIndex(span => span.start === saved?.start));
    }
    saveBookmark();
  }

  render();
  heading();
  if (current) {
    window.scrollTo(0, 0);
    if (sentence > 0) showSentence();
  } else {
    window.scrollTo(0, previous ? libraryScroll : 0);
    if (previous && originCard) {
      const card = [...app.querySelectorAll<HTMLButtonElement>('[data-card]')].find(item => item.dataset.key === originCard);
      (card ?? app.querySelector<HTMLButtonElement>('.hero button'))?.focus({ preventScroll: true });
    }
  }
}

function render() {
  measureDock.disconnect();
  measureInk.disconnect();
  stroke = undefined;
  document.documentElement.lang = activeData().interfaceLanguage ?? 'en';
  document.title = current ? `${current.title} · ${t('brand')}` : t('brand');
  app.dataset.view = current ? 'reader' : 'library';
  app.innerHTML = `${current ? '' : `<header class="site-header">
    <div class="header-inner">
      <button class="brand" data-action="library"><span class="brand-icon">${icon('book')}</span><span>${t('brand')}</span></button>
      <div class="header-actions">
        <span class="offline" role="status" id="offline"></span>
        ${guestData ? button('endGuest', 'endGuest') : ''}
        <button class="button settings" data-action="settings">${icon('settings')}<span>${t('settings')}</span></button>
      </div>
    </div>
  </header>`}
  <main id="main">${current ? renderReader(current) : renderLibrary()}</main>
  <dialog id="settings-dialog" aria-labelledby="settings-title"></dialog>
  <dialog id="highlights-dialog" aria-labelledby="highlights-title"></dialog>
  `;
  updateStatus();
  if (current) {
    refreshControls();
    refreshPassage();
    const dock = app.querySelector('#paint-dock');
    if (dock) measureDock.observe(dock);
    app.querySelectorAll('.ink-layer').forEach(canvas => measureInk.observe(canvas));
  } else renderResults();
}

function updateStatus() {
  const label = app.querySelector('#offline');
  if (label) {
    label.textContent = t(offline);
    label.classList.toggle('is-ready', offline === 'offlineReady');
  }
}

function renderLibrary() {
  const saved = activeData().bookmark;
  const continuation = saved && byKey.get(saved.key);
  const featured = continuation ?? (language === 'en'
    ? byKey.get('en/animal_facts_weaverbird_1')! : passages.find(p => p.language === language)!);
  return `<div class="library-wrap">
    <section class="hero" aria-labelledby="welcome">
      <div class="hero-copy">
        <h1 id="welcome" tabindex="-1">${t('heroTitle')}</h1>
        <div class="inline-actions"><button class="button primary" data-action="open" data-key="${escape(featured.key)}"
          id="start-reading">${t(continuation ? 'resume' : 'start')}</button>
        <button class="button surprise" data-action="surprise">${icon('stories')} ${t('surprise')}</button></div>
        <span class="featured-title" lang="${featured.language}" id="featured-title">${escape(featured.title)}</span>
      </div>
      <div class="hero-art" aria-hidden="true"></div>
    </section>
    <section aria-labelledby="browse" class="collection">
      <div class="section-title"><h2 id="browse">${t('browse')}</h2><span id="result-count" aria-live="polite"></span>
        <div class="theme-reset" hidden>${button('clearTheme', 'allThemes', 'button quiet')}</div>
      </div>
      <ul class="picture-shelf" aria-label="${t('theme')}">
        ${themes.map(item => `<li><button class="picture-card ${item}" data-action="theme-picture" data-theme="${item}" aria-pressed="false">
          <img src="${import.meta.env.BASE_URL}pictures/${item}.webp" width="480" height="480" alt="" draggable="false">
          <span>${t(item)}</span>
        </button></li>`).join('')}
      </ul>
      <div class="filters">
        <label>${t('passageLanguage')}<select id="language">${Object.entries(languages).map(([code, label]) => option(code, label, language)).join('')}</select></label>
        <label>${t('level')}<select id="level">${option('', t('allLevels'), level)}${[1, 2, 3, 4, 5].map(item => option(String(item), `${t('level')} ${item}`, level)).join('')}</select></label>
        <label>${t('search')}<span class="search-input">${icon('search')}<input type="search" id="search" value="${escape(search)}" placeholder="${t('search')}"></span></label>
      </div>
      <div id="results"></div><div id="more" class="more"></div>
    </section>
    ${storageError ? `<p role="status">${t('storageUnavailable')}</p>` : ''}
  </div>`;
}

function matchingPassages() {
  const needle = search.trim().normalize('NFC').toLocaleLowerCase(language);
  return passages.filter(p => p.language === language && (!theme || p.theme === theme) &&
    (!level || String(p.level) === level) && p.title.normalize('NFC').toLocaleLowerCase(language).includes(needle));
}

function renderResults() {
  const results = app.querySelector<HTMLDivElement>('#results');
  if (!results) return;
  const matching = matchingPassages();
  controlFor('surprise')!.disabled = !matching.length;
  app.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(card => {
    card.setAttribute('aria-pressed', String(card.dataset.theme === theme));
  });
  app.querySelector<HTMLElement>('.theme-reset')!.hidden = !theme;
  app.querySelector('#result-count')!.textContent = `${matching.length} ${t('allPassages').toLocaleLowerCase()}`;
  results.innerHTML = matching.length
    ? `<ul class="cards">${matching.slice(0, pageLimit).map(p => `<li>
      <button class="card" data-action="open" data-card data-key="${escape(p.key)}">
        <img class="passage-thumb" src="${import.meta.env.BASE_URL}thumbnails/${encodeURIComponent(passagePictures[p.key])}.webp" width="144" height="144" loading="lazy" alt="">
        <span class="card-content">
          <strong lang="${p.language}">${escape(p.title)}</strong>
          <span>${t(p.theme)} <span aria-hidden="true">·</span> ${t('level')} ${p.level}</span>
        </span>
      </button></li>`).join('')}</ul>`
    : `<div class="empty"><p>${t('noResults')}</p>${button('clearFilters', 'clearFilters')}</div>`;
  app.querySelector('#more')!.innerHTML = matching.length > pageLimit ? button('more', 'more') : '';
  if (!activeData().bookmark) {
    const featured = language === 'en' ? byKey.get('en/animal_facts_weaverbird_1')! : passages.find(p => p.language === language)!;
    app.querySelector<HTMLButtonElement>('#start-reading')!.dataset.key = featured.key;
    const title = app.querySelector<HTMLSpanElement>('#featured-title')!;
    title.lang = language;
    title.textContent = featured.title;
  }
}

function renderReader(passage: Passage) {
  const picture = passage.key === 'en/animal_facts_weaverbird_1'
    ? `<img class="passage-illustration" src="${import.meta.env.BASE_URL}pictures/woven-nest.webp" width="480" height="480" alt="${t('wovenNestPicture')}">`
    : '';
  return `<div class="reader-wrap">
    <div class="reader-nav">
      <button class="button" data-action="library">${icon('back')} ${t('library')}</button>
      <button class="button" id="toggle-tools" data-action="tools" aria-controls="reader-tools" aria-expanded="false">${icon('settings')} ${t('tools')}</button>
    </div>
    <div class="reader-layout">
      <aside id="reader-tools" aria-label="${t('tools')}" hidden></aside>
      <article class="reader" id="reader">
        <div class="reader-title"><h1 tabindex="-1" lang="${passage.language}">${escape(passage.title)}</h1>${picture}</div>
        <div id="guide-tools" hidden></div>
        ${renderListening(passage)}
        <div class="ink-paper">
          <p class="passage-body" id="passage" lang="${passage.language}"></p>
          <canvas class="ink-layer" data-ink-surface="text" aria-hidden="true"></canvas>
        </div>
        <div class="sketch" id="sketch">
          <p>${t('drawHere')}</p>
          <div class="ink-paper sketch-paper">
            <canvas class="ink-layer" data-ink-surface="sketch" aria-hidden="true"></canvas>
          </div>
        </div>
      </article>
    </div>
    <div id="paint-dock" class="paint-dock"><div id="paint-controls"></div><div id="range-tools" hidden></div></div>
    <span id="paint-status" class="sr-only" role="status"></span>
  </div>`;
}

function wordRange(first: number, last: number): Span | undefined {
  if (!structure?.words.length) return;
  const start = structure.words[Math.min(first, last)];
  const end = structure.words[Math.max(first, last)];
  if (!start || !end) return;
  return { start: start.start, end: end.end };
}

function resolvedMarks(passage: Passage, words: Span[]) {
  return marks().flatMap(mark => {
    const span = locate(mark, passage, words);
    return span ? [{ ...span, colour: mark.colour }] : [];
  });
}

function refreshPassage() {
  if (!current || !structure) return;
  const reader = app.querySelector<HTMLElement>('#reader')!;
  reader.dataset.tint = preferences.tint;
  reader.dataset.plain = String(preferences.plain);
  reader.dataset.font = preferences.font;
  reader.style.setProperty('--reading-size', `${preferences.fontSize / 16}rem`);
  reader.style.setProperty('--line-height', String(preferences.lineHeight));
  reader.style.setProperty('--letter-spacing', `${preferences.letterSpacing}em`);
  reader.style.setProperty('--word-spacing', `${preferences.wordSpacing}em`);
  const marksOnPage = resolvedMarks(current, structure.words);
  const body = app.querySelector<HTMLElement>('#passage')!;
  body.classList.toggle('is-selecting', selecting);
  body.dataset.ink = paintColour;
  body.innerHTML = passageMarkup(current, structure, {
    preferences, wordTargets: selecting || (listenOpen && listenMode === 'word'), marks: marksOnPage,
    pending: selecting ? wordRange(startWord, endWord) : undefined, guide: guide && !preferences.plain ? sentence : -1,
  });
  const drawing = paintOpen && !selecting && !preferences.plain;
  reader.dataset.drawing = String(drawing);
  const sketch = app.querySelector<HTMLElement>('#sketch')!;
  sketch.hidden = preferences.plain || (!paintOpen && !inkStrokes().some(item => item.surface === 'sketch' && item.colour !== 'eraser'));
  scheduleInkRender();
  updateListeningTarget();
  const sample = app.querySelector('#cue-sample');
  if (sample) {
    const snippet = structure.sentences[sentence];
    const preview = { ...current, body: current.body.slice(snippet.start, snippet.end) };
    const marked = current.syllable_body;
    if (marked) {
      let position = 0;
      preview.syllable_body = [...marked].filter(character => {
        const inRange = position >= snippet.start && position < snippet.end;
        if (character !== '|') position += character.length;
        return inRange;
      }).join('');
    }
    sample.innerHTML = passageMarkup(preview, readStructure(preview), { preferences, marks: [], wordTargets: false, guide: -1 });
    const previewBox = sample.parentElement!;
    previewBox.dataset.font = reader.dataset.font;
    previewBox.dataset.tint = reader.dataset.tint;
    for (const name of ['--reading-size', '--line-height', '--letter-spacing', '--word-spacing']) {
      previewBox.style.setProperty(name, reader.style.getPropertyValue(name));
    }
  }
  const position = app.querySelector('#sentence-position');
  if (position) position.textContent = `${t('sentence')} ${sentence + 1} / ${structure.sentences.length}`;
}

function refreshControls() {
  if (!structure) return;
  refreshPaintControls();
  const range = app.querySelector<HTMLElement>('#range-tools')!;
  range.hidden = !selecting;
  if (selecting) {
    range.innerHTML = `<p>${t('selectWords')}</p><div class="endpoints">${endpoint('first', 'firstWord')}${endpoint('last', 'lastWord')}</div>
      <output id="pending-quote" aria-live="polite" lang="${current!.language}"></output>
      <div class="inline-actions">${button('save', 'save', 'button primary')}${button('cancel', 'cancel')}</div>`;
    refreshWords();
  }
  const guideTools = app.querySelector<HTMLElement>('#guide-tools')!;
  guideTools.hidden = !guide || preferences.plain;
  guideTools.innerHTML = guide ? `<div class="inline-actions">
    <button class="button" aria-label="${t('prev')}" data-action="prev">${icon('back')}</button>
    <span id="sentence-position" role="status"></span>
    <button class="button" aria-label="${t('next')}" data-action="next">${icon('arrow')}</button>
    <button class="button quiet" aria-label="${t('close')}" data-action="guide">${icon('close')}</button>
  </div>` : '';
  app.querySelector('#reader-tools [data-action="guide"]')?.setAttribute('aria-pressed', String(guide && !preferences.plain));
  refreshListening();
}

function renderListening(passage: Passage) {
  return `<section id="listen-tools" aria-labelledby="listen-title" hidden>
    <div class="tools-heading"><h2 id="listen-title" tabindex="-1">${t('listen')}</h2>
      <button class="button quiet" data-action="listen" aria-label="${t('close')}">${icon('close')}</button></div>
    <p id="listen-status" role="status"></p>
    <div id="listen-options" hidden>
      <p>${t('tapToListen')}</p>
      <div class="listen-settings">
        <label>${t('listenTo')}<select id="listen-mode">
          ${option('sentence', t('sentence'), listenMode)}${option('word', t('word'), listenMode)}
        </select></label>
        <label>${t('speed')}<select id="listen-rate">
          ${speechRates.map((rate, index) => option(String(rate), t((['slow', 'steady', 'normal'] as const)[index]), String(preferences.speechRate))).join('')}
        </select></label>
      </div>
      <div class="stepper listen-stepper">
        <button class="button" data-action="listen-prev">←</button>
        <span id="listen-quote" lang="${passage.language}" aria-live="polite"></span>
        <button class="button" data-action="listen-next">→</button>
      </div>
      <div class="inline-actions">
        ${button('listen-play', 'play', 'button primary')}
        ${button('listen-stop', 'stop')}
      </div>
    </div>
  </section>`;
}

function canListen() {
  return listenOpen && current && !!speech.voiceFor(current.language);
}

function listenSelector() {
  return listenMode === 'word' ? `[data-word="${listenWord}"]` : `[data-sentence="${sentence}"]`;
}

function updateListeningTarget() {
  const body = app.querySelector('#passage');
  if (!body) return;
  const available = !!canListen();
  body.classList.toggle('is-listening', available);
  body.querySelector('.listen-target')?.classList.remove('listen-target');
  if (available && !preferences.plain) body.querySelector(listenSelector())?.classList.add('listen-target');
}

function resetListeningTarget() {
  const from = structure?.sentences[sentence]?.start ?? 0;
  listenWord = Math.max(0, structure?.words.findIndex(word => word.start >= from) ?? 0);
  hasPlayed = false;
  playback = 'idle';
  refreshListening();
}

function refreshListening() {
  const panel = app.querySelector<HTMLElement>('#listen-tools');
  if (!panel || !structure || !current) return;
  panel.hidden = !listenOpen;
  if (!listenOpen) return;
  const available = !!canListen();
  const status = panel.querySelector('#listen-status')!;
  const message = available ? (playback === 'error' ? t('voiceError') : '') : t('voiceUnavailable');
  if (status.textContent !== message) status.textContent = message;
  panel.querySelector<HTMLElement>('#listen-options')!.hidden = !available;
  const wordMode = listenMode === 'word';
  const span = wordMode ? structure.words[listenWord] : structure.sentences[sentence];
  const quote = span ? current.body.slice(span.start, span.end).trim() : '';
  const text = panel.querySelector('#listen-quote')!;
  if (text.textContent !== quote) text.textContent = quote;
  const play = controlFor('listen-play')!;
  play.textContent = t(hasPlayed ? 'replay' : 'play');
  play.disabled = !quote;
  controlFor('listen-stop')!.setAttribute('aria-disabled', String(playback !== 'playing'));
  controlFor('listen-prev')!.setAttribute('aria-label', t(wordMode ? 'prevWord' : 'prev'));
  controlFor('listen-next')!.setAttribute('aria-label', t(wordMode ? 'nextWord' : 'next'));
  const index = wordMode ? listenWord : sentence;
  const count = wordMode ? structure.words.length : structure.sentences.length;
  controlFor('listen-prev')!.setAttribute('aria-disabled', String(index <= 0));
  controlFor('listen-next')!.setAttribute('aria-disabled', String(index >= count - 1));
}

function toggleListening() {
  speech.stop();
  listenOpen = !listenOpen;
  if (listenOpen) {
    selecting = false;
    paintOpen = false;
    stroke = undefined;
    resetListeningTarget();
  }
  refreshControls();
  refreshPassage();
  controlFor('listen')?.focus({ preventScroll: true });
}

function selectListeningTarget(index: number) {
  if (!structure) return;
  speech.stop();
  if (listenMode === 'word') {
    const word = structure.words[index];
    if (!word) return;
    listenWord = index;
    const containing = structure.sentences.findIndex(span => span.start <= word.start && word.start < span.end);
    if (containing >= 0) sentence = containing;
  } else {
    if (!structure.sentences[index]) return;
    sentence = index;
  }
  hasPlayed = false;
  playback = 'idle';
  saveBookmark();
  refreshPassage();
  refreshListening();
}

function playSelection() {
  if (!canListen() || !current || !structure) return;
  const span = listenMode === 'word' ? structure.words[listenWord] : structure.sentences[sentence];
  if (!span) return;
  hasPlayed = true;
  speech.play(current.body.slice(span.start, span.end).trim(), current.language, preferences.speechRate);
}

function renderPaintControls() {
  if (!paintOpen) {
    return `<button class="button paint-launch" data-action="paint" aria-expanded="false" aria-controls="paint-controls">
      <span class="paint-emblem">${icon('highlight')}</span>${t('paint')}
    </button>`;
  }
  return `<div class="paint-tray" role="group" aria-label="${t('paint')}">
    <div class="paint-swatches">
      ${paintColours.map(colour => `<button class="swatch ink-${colour}" data-action="colour" data-colour="${colour}"
        aria-label="${t(colourLabels[colour])}" title="${t(colourLabels[colour])}" aria-pressed="false">
        <span>${icon('check')}</span></button>`).join('')}
    </div>
    <div class="paint-actions">
      <button class="button quiet" data-action="colour" data-colour="eraser" aria-label="${t('eraser')}" title="${t('eraser')}" aria-pressed="false">${icon('eraser')}</button>
      <button class="button quiet" data-action="undo-paint" aria-label="${t('undo')}" title="${t('undo')}">${icon('undo')}</button>
      <button class="button quiet choose-words" data-action="highlight" aria-controls="range-tools" aria-expanded="false">${t('chooseWords')}</button>
      ${button('paint', 'done', 'button primary')}
    </div>
  </div>
  <p class="paint-help" id="paint-hint"></p>`;
}

function refreshPaintControls() {
  const dock = app.querySelector<HTMLElement>('#paint-dock')!;
  const controls = dock.querySelector<HTMLElement>('#paint-controls')!;
  if (dock.dataset.open !== String(paintOpen) || !controls.firstChild) {
    dock.dataset.open = String(paintOpen);
    controls.innerHTML = renderPaintControls();
  }
  if (!paintOpen) return;
  controls.querySelectorAll<HTMLButtonElement>('[data-colour]').forEach(swatch => {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.colour === paintColour));
  });
  controls.querySelector('#paint-hint')!.textContent = t(paintColour === 'eraser' ? 'eraseHint' : 'paintHint');
  controlFor('undo-paint')?.setAttribute('aria-disabled', String(!undoStack.length));
  controlFor('highlight')?.setAttribute('aria-expanded', String(selecting));
}

function togglePaint() {
  paintOpen = !paintOpen;
  selecting = false;
  stroke = undefined;
  if (paintOpen) {
    speech.stop();
    listenOpen = false;
    if (preferences.plain) setPreferences({ ...preferences, plain: false });
  }
  refreshControls();
  refreshPassage();
  (paintOpen
    ? app.querySelector<HTMLButtonElement>('#paint-controls [aria-pressed="true"]')
    : controlFor('paint'))?.focus({ preventScroll: true });
}

function scheduleInkRender() {
  if (inkFrame) return;
  inkFrame = requestAnimationFrame(() => {
    inkFrame = 0;
    const saved = inkStrokes();
    app.querySelectorAll<HTMLCanvasElement>('.ink-layer').forEach(canvas => renderInkCanvas(canvas, saved, stroke?.ink));
  });
}

function addUndo(undo: (typeof undoStack)[number]) {
  undoStack.push(undo);
  if (undoStack.length > 30) undoStack.shift();
}

function saveInk(next: InkStroke[]) {
  if (!current) return;
  (activeData().ink ??= {})[inkKey(current)] = next;
  persist();
  scheduleInkRender();
  refreshPaintControls();
}

function saveMarks(next: Highlight[]) {
  if (!current) return;
  activeData().highlights[current.key] = next;
  persist();
  refreshPassage();
  refreshPaintControls();
}

function changeMarks(next: Highlight[]) {
  const previous = marks();
  if (previous === next) return;
  addUndo({ marks: previous });
  saveMarks(next);
}

function paintRange(range: Span) {
  if (!current || !structure) return;
  const colour = paintColour === 'eraser' ? undefined : paintColour;
  changeMarks(repaint(current, structure.words, marks(), range, colour));
  const announcement = app.querySelector('#paint-status');
  if (announcement) announcement.textContent = `${t(colour ? 'coloured' : 'erased')}: ${current.body.slice(range.start, range.end)}`;
}

function chooseColour(colour: InkColour) {
  if (paintColour === colour) return;
  paintColour = colour;
  refreshPaintControls();
  refreshPassage();
}

function endpoint(name: string, label: Message) {
  return `<fieldset><legend>${t(label)}</legend><div class="stepper">
    <button class="button" data-action="${name}-1" aria-label="${t(label)} · ${t('earlier')}">−</button>
    <span id="${name}-word" lang="${current!.language}"></span>
    <button class="button" data-action="${name}+1" aria-label="${t(label)} · ${t('later')}">+</button>
  </div></fieldset>`;
}

function refreshWords() {
  if (!structure || !current || !selecting) return;
  function wordAt(index: number) {
    const word = structure!.words[index];
    return word ? current!.body.slice(word.start, word.end) : '';
  }
  app.querySelector('#first-word')!.textContent = wordAt(Math.min(startWord, endWord));
  app.querySelector('#last-word')!.textContent = wordAt(Math.max(startWord, endWord));
  const span = wordRange(startWord, endWord);
  app.querySelector('#pending-quote')!.textContent = span ? current.body.slice(span.start, span.end) : '';
}

function changeEndpoint(first: boolean, delta: number) {
  if (!structure) return;
  const low = Math.min(startWord, endWord);
  const high = Math.max(startWord, endWord);
  startWord = first ? Math.max(0, Math.min(high, low + delta)) : low;
  endWord = first ? high : Math.max(low, Math.min(structure.words.length - 1, high + delta));
  awaitingEnd = false;
  refreshWords();
  refreshPassage();
  app.querySelector(`[data-word="${first ? startWord : endWord}"]`)?.scrollIntoView({ block: 'nearest' });
}

function setHighlight(on: boolean) {
  selecting = on && !!structure?.words.length;
  awaitingEnd = false;
  if (selecting) {
    if (listenOpen) {
      speech.stop();
      listenOpen = false;
    }
    const from = structure!.sentences[sentence]?.start ?? 0;
    startWord = endWord = Math.max(0, structure!.words.findIndex(word => word.start >= from));
  }
  refreshControls();
  refreshPassage();
  controlFor('highlight')?.focus({ preventScroll: true });
}

function showHighlights() {
  if (!current) return;
  const dialog = app.querySelector<HTMLDialogElement>('#highlights-dialog')!;
  const saved = marks();
  dialog.innerHTML = `<h2 id="highlights-title">${t('highlights')}</h2>
    ${saved.length ? `<ul class="highlights-list">${saved.map(mark => {
      const match = locate(mark, current!, structure!.words);
      const colour = mark.colour && paintColours.includes(mark.colour) ? mark.colour : 'sun';
      return `<li><div><q class="marked ink-${colour}" lang="${current!.language}">${escape(mark.quote)}</q>${match ? '' : `<small>${t('unmatched')}</small>`}</div>
      <div class="inline-actions">${match ? `<button class="button" data-action="find-mark" data-id="${escape(mark.id)}">${t('guide')}</button>` : ''}
      <button class="button" data-action="remove" data-id="${escape(mark.id)}">${t('remove')}</button></div></li>`;
    }).join('')}</ul>` : `<p>${t('noHighlights')}</p>`}
    <div class="inline-actions">${undoStack.length ? button('undo', 'undo') : ''}${button('close', 'close', 'button primary')}</div>`;
  if (!dialog.open) dialog.showModal();
}

function checkbox(name: keyof Preferences, label: Message, checked: boolean) {
  return `<label class="check"><input type="checkbox" data-preference="${name}" ${checked ? 'checked' : ''}>${t(label)}</label>`;
}

function slider(name: 'fontSize' | 'lineHeight' | 'letterSpacing' | 'wordSpacing', label: Message, min: number, max: number, step: number, unit = '') {
  return `<label class="slider"><span><span id="${name}-label">${t(label)}</span><span class="slider-value" id="${name}-value" aria-hidden="true">${preferences[name]}${unit}</span></span>
    <input data-preference="${name}" data-unit="${unit}" type="range" min="${min}" max="${max}" step="${step}" value="${preferences[name]}"
      aria-labelledby="${name}-label" aria-valuetext="${preferences[name]}${unit}"></label>`;
}

function renderTools() {
  const panel = app.querySelector<HTMLElement>('#reader-tools')!;
  panel.hidden = !toolsOpen;
  app.querySelector('#toggle-tools')!.setAttribute('aria-expanded', String(toolsOpen));
  if (!toolsOpen) return;
  panel.innerHTML = `<div class="tools-heading"><h2>${t('tools')}</h2>
    <button class="button quiet" data-action="tools" aria-label="${t('close')}">${icon('close')}</button></div>
    <div class="panel-actions">
      <button class="button" data-action="listen" aria-controls="listen-tools" aria-expanded="${listenOpen}">${icon('listen')} ${t('listen')}</button>
      <button class="button" data-action="guide" aria-pressed="${guide && !preferences.plain}">${icon('guide')} ${t('guide')}</button>
      ${button('highlights', 'highlights')}
    </div>
    <div class="tool-preview"><p id="cue-sample" lang="${current!.language}"></p></div>
    <fieldset><legend>${t('syllables')}</legend>
      ${checkbox('syllables', 'syllableColours', preferences.syllables)}
      ${checkbox('ticks', 'syllableTicks', preferences.ticks)}
      ${current!.review.syllablesReviewed ? '' : `<small>${t('syllableReview')}</small>`}
    </fieldset>
    <fieldset><legend>${t('letters')}</legend><div class="letter-list">
      ${['b', 'd', 'p', 'q'].map(letter => `<label class="letter-option cue-${letter}"><input type="checkbox" data-letter="${letter}" ${preferences.letters.includes(letter) ? 'checked' : ''}> ${letter}</label>`).join('')}
    </div>
      <label class="extra-letter">${t('extra')} <input id="extra-letter" value="${escape(preferences.extra)}" size="3"></label>
      ${checkbox('uppercase', 'uppercase', preferences.uppercase)}
      ${checkbox('underline', 'underline', preferences.underline)}
    </fieldset>
    <fieldset><legend>${t('page')}</legend>
      <label>${t('font')}<select data-preference="font">${['Andika','Lexend','System'].map(font => option(font, font, preferences.font)).join('')}</select></label>
      ${slider('fontSize','fontSize',18,52,2,' px')}
      ${slider('lineHeight','lineHeight',1.3,2.4,.1)}
      ${slider('letterSpacing','letterSpacing',0,.16,.01,' em')}
      ${slider('wordSpacing','wordSpacing',0,.4,.05,' em')}
      <label>${t('tint')}<select data-preference="tint">${(['paper','cream','mint'] as const).map(tint => option(tint,t(tint),preferences.tint)).join('')}</select></label>
    </fieldset>
    <div class="panel-actions"><button class="button" data-action="plain" aria-pressed="${preferences.plain}">${t('plain')}</button>
      ${button('settings', 'settings')}${guestData ? button('endGuest', 'endGuest') : ''}
      ${button('finish', 'finish', 'button primary')}</div>`;
  refreshPassage();
}

function showSettings() {
  const dialog = app.querySelector<HTMLDialogElement>('#settings-dialog')!;
  dialog.innerHTML = `<h2 id="settings-title">${t('settings')}</h2>
    <label>${t('interfaceLanguage')}<select id="interface-language">
      ${option('en', 'English', activeData().interfaceLanguage ?? 'en')}
      ${option('sl', 'Slovenščina', activeData().interfaceLanguage ?? 'en')}
    </select></label>
    <div class="settings-actions">${guestData ? button('endGuest', 'endGuest') : button('guest', 'guest')}
      ${guestData ? '' : button('clearData', 'clearData')}</div>
    <p>${t(offline)}</p>
    ${storageError ? `<p role="status">${t('storageUnavailable')}</p>` : ''}
    ${button('close', 'close', 'button primary')}`;
  dialog.showModal();
}

function resetFilters() {
  theme = level = search = '';
  pageLimit = PAGE_SIZE;
}

app.addEventListener('pointerdown', event => {
  if (!paintOpen || !event.isPrimary || event.button !== 0) return;
  activatedByTouch = undefined;
  const target = event.target as Element;
  const control = target.closest<HTMLButtonElement>('#paint-controls button');
  if (control && event.pointerType === 'touch') {
    dockTap = { pointer: event.pointerId, control };
    return;
  }
  if (selecting || preferences.plain || stroke || !(target instanceof HTMLCanvasElement)) return;
  const surface = target.dataset.inkSurface as InkSurface;
  if (!surface) return;
  const ink: InkStroke = { surface, colour: paintColour, points: [] };
  stroke = { pointer: event.pointerId, canvas: target, ink };
  appendInkPoint(ink, event, target.getBoundingClientRect());
  event.preventDefault();
  app.setPointerCapture(event.pointerId);
  scheduleInkRender();
});

app.addEventListener('pointermove', event => {
  if (stroke?.pointer !== event.pointerId) return;
  const bounds = stroke.canvas.getBoundingClientRect();
  for (const sample of event.getCoalescedEvents?.() ?? []) appendInkPoint(stroke.ink, sample, bounds);
  appendInkPoint(stroke.ink, event, bounds);
  scheduleInkRender();
});

app.addEventListener('pointerup', event => {
  if (dockTap?.pointer === event.pointerId) {
    const { control } = dockTap;
    dockTap = undefined;
    if (control.contains(document.elementFromPoint(event.clientX, event.clientY))) {
      // A browser can suppress the first synthesized click after a drag.
      activatedByTouch = control;
      control.click();
    }
    return;
  }
  if (stroke?.pointer !== event.pointerId) return;
  const { ink, canvas } = stroke;
  stroke = undefined;
  appendInkPoint(ink, event, canvas.getBoundingClientRect());
  const saved = inkStrokes();
  if (ink.colour !== 'eraser' || saved.some(item => item.surface === ink.surface)) {
    addUndo({ strokeCount: saved.length });
    saveInk([...saved, ink]);
  } else scheduleInkRender();
});

function cancelStroke(event: PointerEvent) {
  if (dockTap?.pointer === event.pointerId) dockTap = undefined;
  if (stroke?.pointer !== event.pointerId) return;
  stroke = undefined;
  scheduleInkRender();
}
app.addEventListener('pointercancel', cancelStroke);
app.addEventListener('lostpointercapture', cancelStroke);

function newSession(guest: boolean) {
  if (guest) saveBookmark();
  guestData = guest ? { ...emptyData(), interfaceLanguage: data.interfaceLanguage } : undefined;
  preferences = { ...defaults, ...activeData().preferences };
  language = activeData().passageLanguage ?? 'en';
  resetFilters();
  libraryScroll = 0;
  originCard = undefined;
  history.replaceState(null, '', location.pathname + location.search);
  showRoute(true);
}

app.addEventListener('click', event => {
  const target = event.target as Element;
  const control = target.closest<HTMLButtonElement>('[data-action]');
  if (control === activatedByTouch && event.isTrusted && event.detail) {
    activatedByTouch = undefined;
    return;
  }
  if (!control) {
    const word = target.closest<HTMLElement>('[data-word]');
    if (selecting && word) {
      const index = Number(word.dataset.word);
      if (awaitingEnd) endWord = index;
      else startWord = endWord = index;
      awaitingEnd = !awaitingEnd;
      refreshWords();
      refreshPassage();
    } else if (canListen() && target.closest('#passage') && window.getSelection()?.isCollapsed !== false) {
      const node = listenMode === 'word' ? word : target.closest<HTMLElement>('[data-sentence]');
      if (node) {
        selectListeningTarget(Number(node.dataset[listenMode]));
        playSelection();
      }
    }
    return;
  }
  const action = control.dataset.action;
  if (control.getAttribute('aria-disabled') === 'true') return;
  switch (action) {
    case 'library': if (current) closePassage(); else window.scrollTo(0, 0); break;
    case 'open': if (control.dataset.key) openPassage(control.dataset.key); break;
    case 'surprise': {
      const choices = matchingPassages();
      const pick = choices[Math.floor(Math.random() * choices.length)];
      if (pick) openPassage(pick.key);
      break;
    }
    case 'theme-picture': {
      const picked = themes.find(item => item === control.dataset.theme);
      if (!picked) break;
      theme = theme === picked ? '' : picked;
      pageLimit = PAGE_SIZE;
      renderResults();
      break;
    }
    case 'clearTheme': {
      const previous = theme;
      theme = '';
      pageLimit = PAGE_SIZE;
      renderResults();
      app.querySelector<HTMLButtonElement>(`[data-theme="${previous}"]`)?.focus();
      break;
    }
    case 'finish': closePassage(true); break;
    case 'tools':
      toolsOpen = !toolsOpen;
      renderTools();
      if (toolsOpen) app.querySelector<HTMLButtonElement>('#reader-tools button')?.focus({ preventScroll: true });
      else app.querySelector<HTMLButtonElement>('#toggle-tools')?.focus({ preventScroll: true });
      break;
    case 'paint': togglePaint(); break;
    case 'colour': chooseColour(control.dataset.colour as InkColour); break;
    case 'highlight': setHighlight(!selecting); break;
    case 'cancel': setHighlight(false); break;
    case 'listen':
      toggleListening();
      toolsOpen = false;
      renderTools();
      if (listenOpen) app.querySelector<HTMLElement>('#listen-title')?.focus();
      else app.querySelector<HTMLButtonElement>('#toggle-tools')?.focus({ preventScroll: true });
      break;
    case 'listen-play': playSelection(); break;
    case 'listen-stop': speech.stop(); break;
    case 'listen-prev': case 'listen-next':
      selectListeningTarget((listenMode === 'word' ? listenWord : sentence) + (action === 'listen-prev' ? -1 : 1));
      app.querySelector(listenSelector())?.scrollIntoView({ block: 'nearest' });
      break;
    case 'guide':
      guide = preferences.plain || !guide;
      if (preferences.plain) setPreferences({ ...preferences, plain: false });
      refreshControls();
      refreshPassage();
      toolsOpen = false;
      renderTools();
      (guide ? controlFor('next') : app.querySelector<HTMLButtonElement>('#toggle-tools'))?.focus({ preventScroll: true });
      break;
    case 'prev': changeSentence(-1); break;
    case 'next': changeSentence(1); break;
    case 'first-1': case 'first+1': case 'last-1': case 'last+1':
      changeEndpoint(action.startsWith('first'), action.endsWith('+1') ? 1 : -1);
      break;
    case 'save': {
      const span = wordRange(startWord, endWord);
      if (!current || !span) break;
      paintRange(span);
      setHighlight(false);
      break;
    }
    case 'highlights': showHighlights(); break;
    case 'find-mark': {
      const item = marks().find(mark => mark.id === control.dataset.id);
      if (!item || !current || !structure) break;
      const match = locate(item, current, structure.words);
      if (!match) break;
      const index = structure.sentences.findIndex(span => span.start <= match.start && match.start < span.end);
      control.closest('dialog')?.close();
      changeSentence(index - sentence);
      break;
    }
    case 'remove': {
      const list = marks();
      const index = list.findIndex(mark => mark.id === control.dataset.id);
      if (index < 0) break;
      changeMarks(list.filter((_, position) => position !== index));
      showHighlights();
      app.querySelector<HTMLButtonElement>('#highlights-dialog [data-action="undo"]')?.focus();
      break;
    }
    case 'undo-paint':
    case 'undo': {
      const before = undoStack.pop();
      if (!before) break;
      if ('marks' in before) saveMarks(before.marks);
      else saveInk(inkStrokes().slice(0, before.strokeCount));
      const dialog = app.querySelector<HTMLDialogElement>('#highlights-dialog');
      if (dialog?.open) {
        showHighlights();
        dialog.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
      }
      break;
    }
    case 'plain':
      if (!preferences.plain) {
        paintOpen = selecting = false;
        stroke = undefined;
      }
      setPreferences({ ...preferences, plain: !preferences.plain });
      control.setAttribute('aria-pressed', String(preferences.plain));
      refreshControls();
      refreshPassage();
      break;
    case 'settings': showSettings(); break;
    case 'close':
      control.closest('dialog')?.close();
      break;
    case 'guest': newSession(true); break;
    case 'endGuest': newSession(false); break;
    case 'clearData':
      if (window.confirm(t('clearConfirm'))) {
        data = emptyData();
        persist();
        newSession(false);
      }
      break;
    case 'clearFilters':
      resetFilters();
      render();
      app.querySelector<HTMLInputElement>('#search')?.focus();
      break;
    case 'more': {
      const previous = pageLimit;
      pageLimit += PAGE_SIZE;
      renderResults();
      app.querySelectorAll<HTMLButtonElement>('[data-card]')[previous]?.focus();
      break;
    }
  }
});

function controlFor(action: string) {
  return app.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
}

app.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'search') {
    search = input.value;
    pageLimit = PAGE_SIZE;
    renderResults();
  } else if (input.type === 'range' && input.dataset.preference) {
    const key = input.dataset.preference;
    const value = input.value + (input.dataset.unit ?? '');
    app.querySelector(`#${key}-value`)!.textContent = value;
    input.setAttribute('aria-valuetext', value);
    preferences = { ...preferences, [key]: input.valueAsNumber };
    activeData().preferences = preferences;
    refreshPassage();
    window.clearTimeout(settingTimer);
    settingTimer = window.setTimeout(persist, 100);
  }
});

app.addEventListener('change', event => {
  const input = event.target as HTMLInputElement | HTMLSelectElement;
  switch (input.id) {
    case 'listen-mode':
      speech.stop();
      listenMode = input.value === 'word' ? 'word' : 'sentence';
      resetListeningTarget();
      refreshPassage();
      return;
    case 'listen-rate':
      setPreferences({ ...preferences, speechRate: Number(input.value) as SpeechRate });
      return;
    case 'language':
      language = input.value as Language;
      activeData().passageLanguage = language;
      persist();
      break;
    case 'level': level = input.value; break;
    case 'interface-language':
      activeData().interfaceLanguage = input.value as 'en' | 'sl';
      persist();
      render();
      if (toolsOpen) renderTools();
      showSettings();
      app.querySelector<HTMLSelectElement>('#interface-language')?.focus();
      return;
    case 'extra-letter': {
      const letter = input.value.trim().normalize('NFC');
      const grapheme = new Intl.Segmenter(current?.language, { granularity: 'grapheme' });
      const isSingleLetter = /^\p{L}\p{M}*$/u.test(letter) && [...grapheme.segment(letter)].length === 1;
      input.value = isSingleLetter ? letter.toLocaleLowerCase(current?.language) : preferences.extra;
      if (!letter) input.value = '';
      setPreferences({ ...preferences, extra: input.value });
      return;
    }
    default: {
      const key = input.dataset.preference;
      const letter = input.dataset.letter;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        if (letter) {
          const letters = input.checked ? [...preferences.letters, letter] : preferences.letters.filter(value => value !== letter);
          setPreferences({ ...preferences, letters });
        } else if (key) setPreferences({ ...preferences, [key]: input.checked });
      } else if (key === 'font' || key === 'tint') {
        setPreferences({ ...preferences, [key]: input.value });
      }
      return;
    }
  }
  pageLimit = PAGE_SIZE;
  renderResults();
});

window.addEventListener('popstate', () => showRoute());
window.addEventListener('scroll', () => {
  if (!current || guide || selecting || stroke || listenOpen || scrollFrame || performance.now() < ignoreScrollUntil) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const viewportLine = Math.min(innerHeight * .3, Math.max(100, innerHeight - 100));
    const visible = [...app.querySelectorAll<HTMLElement>('[data-sentence]')].find(el => el.getBoundingClientRect().bottom > viewportLine);
    if (!visible) return;
    sentence = Number(visible.dataset.sentence);
    saveBookmark();
  });
}, { passive: true });
window.addEventListener('pagehide', () => { speech.stop(); saveBookmark(); persist(); });

async function enableOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    offline = 'offlineUnavailable';
    updateStatus();
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register(new URL(/* @vite-ignore */ '../sw.js', import.meta.url).href);
    const watch = (worker?: ServiceWorker | null) => {
      const update = () => {
        offline = registration.waiting ? 'updateReady' : navigator.serviceWorker.controller ? 'offlineReady'
          : worker?.state === 'redundant' ? 'offlineUnavailable' : 'offlinePreparing';
        updateStatus();
      };
      worker?.addEventListener('statechange', update);
      update();
    };
    registration.addEventListener('updatefound', () => watch(registration.installing));
    navigator.serviceWorker.addEventListener('controllerchange', () => watch());
    watch(registration.installing);
  } catch {
    offline = navigator.serviceWorker.controller ? 'offlineReady' : 'offlineUnavailable';
    updateStatus();
  }
}

async function init() {
  try {
    await loadLibrary();
  } catch {
    app.textContent = 'The library could not load. Refresh the page to try again.';
    return;
  }
  try {
    database = await loadStore();
    data = { ...emptyData(), ...database.data };
  } catch {
    storageError = true;
  }
  preferences = { ...defaults, ...data.preferences };
  language = data.passageLanguage ?? 'en';
  showRoute();
  void enableOffline();
}

void init();
