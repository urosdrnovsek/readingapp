import type { Passage } from './content';
import type { SpeechRate } from './speech';

export type Span = { start: number; end: number };
export type Anchor = Span & { version: number; quote: string };
export const paintColours = ['sun', 'rose', 'mint', 'sky', 'lilac'] as const;
export type PaintColour = typeof paintColours[number];
export type Highlight = Anchor & { id: string; colour?: PaintColour };
export type PaintSpan = Span & { colour?: PaintColour };

export type Preferences = {
  syllables: boolean;
  ticks: boolean;
  letters: string[];
  extra: string;
  uppercase: boolean;
  underline: boolean;
  font: 'Andika' | 'Lexend' | 'System';
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  wordSpacing: number;
  tint: 'paper' | 'cream' | 'mint';
  plain: boolean;
  speechRate: SpeechRate;
};

export const defaults: Preferences = {
  syllables: false, ticks: false, letters: [], extra: '', uppercase: false, underline: false,
  font: 'Andika', fontSize: 24, lineHeight: 1.6, letterSpacing: 0, wordSpacing: 0,
  tint: 'paper', plain: false, speechRate: 0.8,
};

export function makeAnchor(passage: Passage, range: Span): Anchor {
  return { ...range, version: passage.version, quote: passage.body.slice(range.start, range.end) };
}

export function locate(anchor: Anchor, passage: Passage, spans: Span[]): Span | undefined {
  const { body, version } = passage;
  if (version === anchor.version && body.slice(anchor.start, anchor.end) === anchor.quote) return anchor;
  if (!anchor.quote) return undefined;
  const ends = new Set(spans.map(span => span.end));
  const matches = spans.filter(({start}) => ends.has(start + anchor.quote.length) && body.startsWith(anchor.quote, start));
  if (matches.length !== 1) return undefined;
  return { start: matches[0].start, end: matches[0].start + anchor.quote.length };
}

export function makeHighlight(passage: Passage, range: Span, colour?: PaintColour): Highlight {
  return { ...makeAnchor(passage, range), colour, id: crypto.getRandomValues(new Uint32Array(4)).join('-') };
}

export function repaint(
  passage: Passage, words: Span[], marks: Highlight[], range: Span, colour?: PaintColour,
): Highlight[] {
  const overlapping = new Map<Highlight, Span>();
  for (const mark of marks) {
    const span = locate(mark, passage, words);
    if (span && span.start < range.end && span.end > range.start) overlapping.set(mark, span);
  }
  if (!overlapping.size && !colour) return marks;
  if (overlapping.size === 1 && colour) {
    const [[mark, span]] = overlapping;
    if ((mark.colour ?? 'sun') === colour && span.start <= range.start && range.end <= span.end) return marks;
  }
  const result = marks.flatMap(mark => {
    const located = overlapping.get(mark);
    if (!located) return [mark];
    const remaining = (start: number, end: number) => {
      const kept = words.filter(word => word.start >= start && word.end <= end);
      if (!kept.length) return [];
      return [makeHighlight(passage, { start: kept[0].start, end: kept[kept.length - 1].end }, mark.colour)];
    };
    return [...remaining(located.start, range.start), ...remaining(range.end, located.end)];
  });
  if (colour) result.push(makeHighlight(passage, range, colour));
  return result;
}

function segments(passage: Passage, granularity: 'word' | 'sentence' | 'grapheme') {
  return [...new Intl.Segmenter(passage.language, { granularity }).segment(passage.body)];
}

export function readStructure(passage: Passage) {
  const words = segments(passage, 'word').filter(part => part.isWordLike)
    .map(part => ({ start: part.index, end: part.index + part.segment.length }));
  const sentences = segments(passage, 'sentence')
    .map(part => ({ start: part.index, end: part.index + part.segment.length }));
  const graphemes = segments(passage, 'grapheme');
  const breaks = new Set<number>();
  const marked = passage.syllable_body;
  if (marked && marked.replaceAll('|', '') === passage.body) {
    let offset = 0;
    for (const part of marked.split('|').slice(0, -1)) {
      offset += part.length;
      breaks.add(offset);
    }
  }
  return { words, sentences, graphemes, breaks };
}

const escaped: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (value: string) => value.replace(/[&<>"']/g, character => escaped[character]);

export function passageMarkup(
  passage: Passage,
  structure: ReturnType<typeof readStructure>,
  options: { preferences: Preferences; wordTargets: boolean; marks: PaintSpan[]; pending?: Span; guide: number },
) {
  const { preferences, wordTargets, marks, pending, guide } = options;
  const { words, sentences, graphemes, breaks } = structure;
  const letters = new Set([...preferences.letters, preferences.extra].filter(Boolean));
  const contains = (span: Span | undefined, offset: number) => span && span.start <= offset && offset < span.end;
  const wordStart = new Map(words.map((word, index) => [word.start, index]));
  const wordEnds = new Set(words.map(word => word.end));
  const sentenceStart = new Map(sentences.map((sentence, index) => [sentence.start, index]));
  let html = '';
  let word: number | undefined;
  let syllable = 0;
  let currentClasses = '';
  let run = '';
  const flush = () => {
    if (run) html += currentClasses ? `<span class="${currentClasses}">${escape(run)}</span>` : escape(run);
    run = '';
  };

  for (const { index, segment } of graphemes) {
    const sentence = sentenceStart.get(index);
    const beginsWord = wordStart.get(index);
    const endsWord = word !== undefined && wordEnds.has(index);
    if (sentence !== undefined || beginsWord !== undefined || endsWord) flush();
    if (endsWord && wordTargets) html += '</span>';
    if (endsWord) word = undefined;
    if (sentence !== undefined) {
      if (sentence > 0) html += '</span>';
      html += `<span data-sentence="${sentence}"${guide === sentence ? ' class="guided"' : ''}>`;
    }
    if (beginsWord !== undefined) {
      word = beginsWord;
      syllable = 0;
      if (wordTargets) html += `<span data-word="${word}">`;
    }
    const atBreak = word !== undefined && index !== words[word].start && breaks.has(index);
    if (atBreak) syllable += 1;

    const classes: string[] = [];
    if (contains(pending, index)) classes.push('pending');
    else if (!preferences.plain) {
      const mark = marks.find(mark => contains(mark, index));
      if (mark) classes.push('marked', `ink-${paintColours.find(colour => colour === mark.colour) ?? 'sun'}`);
    }
    if (!preferences.plain) {
      const letter = preferences.uppercase ? segment.toLocaleLowerCase(passage.language) : segment;
      if (letters.has(letter)) {
        classes.push('cue', ['b', 'd', 'p', 'q'].includes(letter) ? `cue-${letter}` : 'cue-extra');
        if (preferences.underline) classes.push('underlined');
      } else if (preferences.syllables && breaks.size && word !== undefined) {
        classes.push(syllable % 2 ? 'syllable-b' : 'syllable-a');
      }
      if (atBreak && preferences.ticks) classes.push('syllable-break');
    }
    const nextClasses = classes.join(' ');
    if (nextClasses !== currentClasses || classes.includes('syllable-break')) {
      flush();
      currentClasses = nextClasses;
    }
    run += segment;
    // A boundary tick belongs to a single grapheme even at consecutive breaks.
    if (classes.includes('syllable-break')) flush();
  }
  flush();
  if (wordTargets && word !== undefined) html += '</span>';
  if (sentences.length) html += '</span>';
  return html;
}
