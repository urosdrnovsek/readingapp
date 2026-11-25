import languageRegistry from './languages.json';

export const languages = Object.fromEntries(
  Object.entries(languageRegistry).map(([code, { name }]) => [code, name]),
) as Record<Language, string>;

export type Language = keyof typeof languageRegistry;
export type Theme = 'stories' | 'animal_facts' | 'around_the_world' | 'amazing_science' | 'nature_seasons';

type Entry = {
  id: string;
  version: number;
  title: string;
  body: string;
  syllable_body?: string;
  theme: Theme;
  level: number;
  review: { status: string; syllablesReviewed: boolean };
};
export type Passage = Entry & { language: Language; key: string; readingMinutes: number };
type Pack = { language: Language; entries: Entry[] };

const files = import.meta.glob<Pack>('../content/*.json', { import: 'default' });
export const passages: Passage[] = [];
export const byKey = new Map<string, Passage>();

export async function loadLibrary() {
  const packs = await Promise.all(Object.values(files).map(load => load()));
  for (const { language, entries } of packs) {
    const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
    for (const entry of entries) {
      if (entry.review.status !== 'reviewed') continue;
      const words = [...segmenter.segment(entry.body)].filter(segment => segment.isWordLike).length;
      const readingMinutes = Math.max(1, Math.round(words / 100));
      const passage = { ...entry, language, key: `${language}/${entry.id}`, readingMinutes };
      passages.push(passage);
      byKey.set(passage.key, passage);
    }
  }
}
export const themes: Theme[] = ['stories', 'animal_facts', 'around_the_world', 'amazing_science', 'nature_seasons'];
