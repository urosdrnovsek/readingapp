import type { Language } from './content';

import languageRegistry from './languages.json';

export const speechRates = [0.65, 0.8, 1] as const;
export type SpeechRate = typeof speechRates[number];
type SpeechStatus = 'idle' | 'playing' | 'error';

export function createSpeech(onChange: (status: SpeechStatus) => void) {
  const engine = window.speechSynthesis;
  let active: SpeechSynthesisUtterance | undefined;

  function voiceFor(language: Language) {
    const matching = engine?.getVoices().filter(voice =>
      voice.localService && voice.lang.toLowerCase().split(/[-_]/)[0] === language,
    );
    return matching?.find(voice => voice.lang.replaceAll('_', '-').toLowerCase() === languageRegistry[language].voiceLocale.toLowerCase())
      ?? matching?.find(voice => voice.default) ?? matching?.[0];
  }

  function stop() {
    if (!active) return;
    active = undefined;
    engine.cancel();
    onChange('idle');
  }

  function play(text: string, language: Language, rate: SpeechRate) {
    stop();
    const voice = voiceFor(language);
    if (!voice || !text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = rate;
    active = utterance;
    const settle = (status: SpeechStatus) => {
      if (active !== utterance) return;
      active = undefined;
      onChange(status);
    };
    utterance.onend = () => settle('idle');
    utterance.onerror = () => settle('error');
    onChange('playing');
    try {
      engine.speak(utterance);
    } catch {
      settle('error');
    }
  }

  engine?.addEventListener('voiceschanged', () => {
    if (!active) onChange('idle');
  });
  return { voiceFor, play, stop };
}
