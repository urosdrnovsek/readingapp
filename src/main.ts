import './style.css';
import { byKey, languages, loadLibrary, passages, themes, type Language, type Passage } from './content';
import { defaults, escape, locate, makeAnchor, passageMarkup, readStructure, type Highlight, type Preferences, type Span } from './reading';
import { emptyData, loadStore, type ReadingData } from './storage';
import { strings, type Message } from './strings';
import { icon } from './icons';

const app = document.querySelector<HTMLDivElement>('#app')!;
const PAGE_SIZE = 12;
let data = emptyData();
let guestData: ReadingData | undefined;
let database: Awaited<ReturnType<typeof loadStore>> | undefined;
let storageError = false;
let offline: Message = 'offlinePreparing';
let preferences = { ...defaults };
let language: Language = 'en';
let theme = '';
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
let removed: Highlight | undefined;
let scrollFrame = 0;
let ignoreScrollUntil = 0;
let settingTimer: number | undefined;

const activeData = () => guestData ?? data;
const t = (message: Message) => strings[message][activeData().interfaceLanguage === 'sl' ? 1 : 0];
const heading = () => app.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
const option = (value: string, label: string, selected: string) =>
  `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(label)}</option>`;
const button = (action: string, label: Message, classes = 'button') =>
  `<button type="button" class="${classes}" data-action="${action}">${t(label)}</button>`;
const marks = () => current ? activeData().highlights[current.key] ?? [] : [];

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
  sentence = Math.max(0, Math.min(structure.sentences.length - 1, sentence + offset));
  saveBookmark();
  refreshPassage();
  showSentence();
}

function route() {
  const key = location.hash.startsWith('#read/') ? location.hash.slice(6) : '';
  return byKey.get(key);
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
  cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  const previous = current;
  if (!finished) saveBookmark();
  current = route();
  structure = current && readStructure(current);
  guide = selecting = toolsOpen = awaitingEnd = false;
  removed = undefined;
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
  document.documentElement.lang = activeData().interfaceLanguage ?? 'en';
  document.title = current ? `${current.title} · ${t('brand')}` : t('brand');
  app.innerHTML = `<header class="site-header">
    <div class="header-inner">
      <button class="brand" data-action="library"><span class="brand-icon">${icon('book')}</span><span>${t('brand')}</span></button>
      <div class="header-actions">
        <span class="offline" role="status" id="offline"></span>
        ${guestData ? button('endGuest', 'endGuest') : ''}
        <button class="button settings" data-action="settings">${icon('settings')}<span>${t('settings')}</span></button>
      </div>
    </div>
  </header>
  <main id="main">${current ? renderReader(current) : renderLibrary()}</main>
  <dialog id="settings-dialog" aria-labelledby="settings-title"></dialog>
  <dialog id="highlights-dialog" aria-labelledby="highlights-title"></dialog>
  `;
  updateStatus();
  if (current) {
    refreshPassage();
    refreshControls();
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
        <p>${t('heroDescription')}</p>
        <button class="button primary" data-action="open" data-key="${escape(featured.key)}"
          id="start-reading">${t(continuation ? 'resume' : 'start')} ${icon('arrow')}</button>
        <span class="featured-title" lang="${featured.language}" id="featured-title">${escape(featured.title)}</span>
      </div>
      <div class="hero-art" aria-hidden="true"></div>
    </section>
    <section aria-labelledby="browse" class="collection">
      <div class="section-title"><h2 id="browse">${t('browse')}</h2><span id="result-count" aria-live="polite"></span></div>
      <div class="filters">
        <label>${t('passageLanguage')}<select id="language">${Object.entries(languages).map(([code, label]) => option(code, label, language)).join('')}</select></label>
        <label>${t('theme')}<select id="theme">${option('', t('allThemes'), theme)}${themes.map(item => option(item, t(item), theme)).join('')}</select></label>
        <label>${t('level')}<select id="level">${option('', t('allLevels'), level)}${[1, 2, 3, 4, 5].map(item => option(String(item), `${t('level')} ${item}`, level)).join('')}</select></label>
        <label>${t('search')}<span class="search-input">${icon('search')}<input type="search" id="search" value="${escape(search)}" placeholder="${t('search')}"></span></label>
      </div>
      <div id="results"></div><div id="more" class="more"></div>
    </section>
    ${storageError ? `<p role="status">${t('storageUnavailable')}</p>` : ''}
  </div>`;
}

function renderResults() {
  const results = app.querySelector<HTMLDivElement>('#results');
  if (!results) return;
  const needle = search.trim().normalize('NFC').toLocaleLowerCase(language);
  const matching = passages.filter(p => p.language === language && (!theme || p.theme === theme) &&
    (!level || String(p.level) === level) && p.title.normalize('NFC').toLocaleLowerCase(language).includes(needle));
  app.querySelector('#result-count')!.textContent = `${matching.length} ${t('allPassages').toLocaleLowerCase()}`;
  results.innerHTML = matching.length
    ? `<ul class="cards">${matching.slice(0, pageLimit).map(p => `<li>
      <button class="card" data-action="open" data-card data-key="${escape(p.key)}">
        <span class="tile ${p.theme}">${icon(p.theme)}</span>
        <span class="card-content">
          <strong lang="${p.language}">${escape(p.title)}</strong>
          <span>${t(p.theme)} <span aria-hidden="true">·</span> ${t('level')} ${p.level}</span>
        </span>
        <span class="card-arrow">${icon('arrow')}</span>
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
  return `<div class="reader-wrap">
    <div class="reader-nav">
      <button class="button" data-action="library">${icon('back')} ${t('library')}</button>
      <button class="button" id="toggle-tools" data-action="tools" aria-controls="reader-tools" aria-expanded="false">${icon('settings')} ${t('tools')}</button>
    </div>
    <div class="reader-layout">
      <aside id="reader-tools" aria-label="${t('tools')}" hidden></aside>
      <article class="reader" id="reader">
        <div class="reader-meta"><span class="tile ${passage.theme}">${icon(passage.theme)}</span>
          <span>${t(passage.theme)} · ${t('level')} ${passage.level}</span></div>
        <h1 tabindex="-1" lang="${passage.language}">${escape(passage.title)}</h1>
        <div class="reader-controls" id="reader-controls"></div>
        <div id="range-tools" hidden></div>
        <div id="guide-tools" hidden></div>
        <div id="removal" role="status" hidden></div>
        <p class="passage-body" id="passage" lang="${passage.language}"></p>
      </article>
    </div>
  </div>`;
}

function pendingRange(): Span | undefined {
  if (!selecting || !structure?.words.length) return;
  return {
    start: structure.words[Math.min(startWord, endWord)].start,
    end: structure.words[Math.max(startWord, endWord)].end,
  };
}

function refreshPassage() {
  if (!current || !structure) return;
  const reader = app.querySelector<HTMLElement>('#reader')!;
  reader.dataset.tint = preferences.tint;
  reader.dataset.font = preferences.font;
  reader.style.setProperty('--reading-size', `${preferences.fontSize / 16}rem`);
  reader.style.setProperty('--line-height', String(preferences.lineHeight));
  reader.style.setProperty('--letter-spacing', `${preferences.letterSpacing}em`);
  reader.style.setProperty('--word-spacing', `${preferences.wordSpacing}em`);
  const marksOnPage = marks().flatMap(mark => locate(mark, current!, structure!.words) ?? []);
  const body = app.querySelector('#passage')!;
  body.classList.toggle('is-selecting', selecting);
  body.innerHTML = passageMarkup(current, structure, {
    preferences, marking: selecting, marks: marksOnPage,
    pending: pendingRange(), guide: guide && !preferences.plain ? sentence : -1,
  });
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
    sample.innerHTML = passageMarkup(preview, readStructure(preview), { preferences, marks: [], marking: false, guide: -1 });
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
  app.querySelector('#reader-controls')!.innerHTML = `
    <button class="button" data-action="highlight" aria-pressed="${selecting}">${icon('highlight')} ${t('highlight')}</button>
    <button class="button" data-action="guide" aria-pressed="${guide && !preferences.plain}">${icon('guide')} ${t('guide')}</button>
    ${button('highlights', 'highlights')}
    ${button('finish', 'finish', 'button primary finish')}`;
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
  guideTools.innerHTML = guide ? `<div class="inline-actions">${button('prev', 'prev')}<span id="sentence-position" role="status"></span>${button('next', 'next')}</div>` : '';
  refreshRemoval();
}

function refreshRemoval() {
  const removal = app.querySelector<HTMLElement>('#removal')!;
  removal.hidden = !removed;
  removal.innerHTML = removed ? button('undo', 'undo') : '';
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
  const span = pendingRange();
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
    const from = structure!.sentences[sentence]?.start ?? 0;
    startWord = endWord = Math.max(0, structure!.words.findIndex(word => word.start >= from));
  }
  refreshControls();
  refreshPassage();
  app.querySelector<HTMLButtonElement>('[data-action="highlight"]')?.focus({ preventScroll: true });
}

function showHighlights() {
  if (!current) return;
  const dialog = app.querySelector<HTMLDialogElement>('#highlights-dialog')!;
  const saved = marks();
  dialog.innerHTML = `<h2 id="highlights-title">${t('highlights')}</h2>
    ${saved.length ? `<ul class="highlights-list">${saved.map(mark => {
      const match = locate(mark, current!, structure!.words);
      return `<li><div><q lang="${current!.language}">${escape(mark.quote)}</q>${match ? '' : `<small>${t('unmatched')}</small>`}</div>
      <div class="inline-actions">${match ? `<button class="button" data-action="find-mark" data-id="${escape(mark.id)}">${t('guide')}</button>` : ''}
      <button class="button" data-action="remove" data-id="${escape(mark.id)}">${t('remove')}</button></div></li>`;
    }).join('')}</ul>` : `<p>${t('noHighlights')}</p>`}
    <div class="inline-actions">${removed ? button('undo', 'undo') : ''}${button('close', 'close', 'button primary')}</div>`;
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
  panel.innerHTML = `<h2>${t('tools')}</h2>
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
    <button class="button" data-action="plain" aria-pressed="${preferences.plain}">${t('plain')}</button>`;
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
  if (!control) {
    const word = target.closest<HTMLElement>('[data-word]');
    if (selecting && word) {
      const index = Number(word.dataset.word);
      if (awaitingEnd) endWord = index;
      else startWord = endWord = index;
      awaitingEnd = !awaitingEnd;
      refreshWords();
      refreshPassage();
    }
    return;
  }
  const action = control.dataset.action;
  switch (action) {
    case 'library': if (current) closePassage(); else window.scrollTo(0, 0); break;
    case 'open': if (control.dataset.key) openPassage(control.dataset.key); break;
    case 'finish': closePassage(true); break;
    case 'tools':
      toolsOpen = !toolsOpen;
      renderTools();
      if (toolsOpen) app.querySelector<HTMLInputElement>('#reader-tools input')?.focus({ preventScroll: true });
      break;
    case 'highlight': setHighlight(!selecting); break;
    case 'cancel': setHighlight(false); break;
    case 'guide':
      guide = preferences.plain || !guide;
      if (preferences.plain) setPreferences({ ...preferences, plain: false });
      refreshControls();
      refreshPassage();
      controlFor('guide')?.focus({ preventScroll: true });
      break;
    case 'prev': changeSentence(-1); break;
    case 'next': changeSentence(1); break;
    case 'first-1': case 'first+1': case 'last-1': case 'last+1':
      changeEndpoint(action.startsWith('first'), action.endsWith('+1') ? 1 : -1);
      break;
    case 'save': {
      const span = pendingRange();
      if (!current || !span) break;
      if (preferences.plain) setPreferences({ ...preferences, plain: false });
      const list = marks();
      const id = crypto.getRandomValues(new Uint32Array(4)).join('-');
      (activeData().highlights[current.key] ??= list).push({ ...makeAnchor(current, span), id });
      persist();
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
      [removed] = list.splice(index, 1);
      persist();
      refreshPassage();
      refreshRemoval();
      showHighlights();
      app.querySelector<HTMLButtonElement>('#highlights-dialog [data-action="undo"]')?.focus();
      break;
    }
    case 'undo': {
      if (!current || !removed) break;
      marks().push(removed);
      removed = undefined;
      persist();
      refreshPassage();
      refreshRemoval();
      const dialog = app.querySelector<HTMLDialogElement>('#highlights-dialog');
      if (dialog?.open) {
        showHighlights();
        dialog.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
      } else controlFor('highlights')?.focus();
      break;
    }
    case 'plain':
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
    case 'language':
      language = input.value as Language;
      activeData().passageLanguage = language;
      persist();
      break;
    case 'theme': theme = input.value; break;
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
  if (!current || guide || selecting || scrollFrame || performance.now() < ignoreScrollUntil) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const viewportLine = Math.min(innerHeight * .3, Math.max(100, innerHeight - 100));
    const visible = [...app.querySelectorAll<HTMLElement>('[data-sentence]')].find(el => el.getBoundingClientRect().bottom > viewportLine);
    if (!visible) return;
    sentence = Number(visible.dataset.sentence);
    saveBookmark();
  });
}, { passive: true });
window.addEventListener('pagehide', () => { saveBookmark(); persist(); });

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
    offline = 'offlineUnavailable';
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
