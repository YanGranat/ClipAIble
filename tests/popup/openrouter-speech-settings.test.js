// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { URL as FileURL } from 'node:url';
import { beforeEach, expect, it, vi } from 'vitest';
import { initOpenRouterMedia } from '../../popup/settings/openrouter-media.js';
import { readOpenRouterSpeechControls } from '../../popup/settings/openrouter-speech.js';

const flash = 'google/gemini-3.8-flash-tts';
const lite = 'google/gemini-3.8-flash-lite-tts';
const mai = 'microsoft/mai-voice-2.1';
const grok = 'x-ai/grok-voice-tts-1.0';
const eleven = 'elevenlabs/eleven-v4';
const voxtral = 'mistralai/voxtral-mini-tts-3-0';
const html = readFileSync(new FileURL('../../popup/popup.html', import.meta.url), 'utf8');
let elements;
let save;
let ui;

const field = name => document.querySelector('[data-speech-option="' + name + '"]');
const enabled = () => Array.from(document.querySelectorAll('[data-speech-option]:not([disabled])'), x => x.dataset.speechOption);
function choose(el, value, event = 'change') {
  el.value = String(value);
  el.dispatchEvent(new Event(event, { bubbles: true }));
}
const model = value => choose(elements.openrouterTtsModel, value);
const voice = value => choose(elements.openrouterTtsVoice, value);
const snapshot = () => readOpenRouterSpeechControls(elements, elements.openrouterTtsModel.value, elements.openrouterTtsVoice.value);

beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  elements = Object.fromEntries(['openrouterImageModel', 'openrouterTtsModel', 'openrouterTtsVoice'].map(id => [id, document.getElementById(id)]));
  save = vi.fn();
  ui = initOpenRouterMedia(elements, save);
  ui.restore({ openrouter_tts_model: flash });
});

it('keeps support and ranges model-specific when switching in the popup', () => {
  expect(enabled()).toEqual(['instructions']);
  choose(field('instructions'), 'Read slowly.', 'input');
  model(lite);
  expect(field('instructions').value).toBe('');
  choose(field('instructions'), 'Read briskly.', 'input');
  model(eleven);
  expect(enabled()).toEqual(['stability', 'similarity']);
  model(grok);
  expect(enabled()).toEqual(['speed']);
  expect([field('speed').min, field('speed').max]).toEqual(['0.7', '1.5']);
  choose(field('speed'), 1.35, 'input');
  expect(snapshot()).toEqual({ speed: 1.35 });
  model(mai);
  expect([field('speed').min, field('speed').max]).toEqual(['0.5', '2']);
  expect(snapshot()).toEqual({});
  model(voxtral);
  expect(enabled()).toEqual([]);
  expect(elements.openrouterTtsVoice.options).toHaveLength(66);
  expect(snapshot()).toEqual({});
  model(flash);
  expect(snapshot()).toEqual({ instructions: 'Read slowly.' });
  model(lite);
  expect(snapshot()).toEqual({ instructions: 'Read briskly.' });
  model(grok);
  expect(snapshot()).toEqual({ speed: 1.35 });
  expect(save).toHaveBeenCalledWith('openrouter_tts_options', {
    [flash]: { instructions: 'Read slowly.' }, [lite]: { instructions: 'Read briskly.' }, [grok]: { speed: 1.35 }
  });
});

it('hides unsupported styles when changing voices and restores the profile upon reopening', () => {
  model(mai);
  voice('en-US-Harper:MAI-Voice-2.1');
  choose(field('style'), 'whispering');
  expect(snapshot()).toEqual({ style: 'whispering' });
  voice('en-US-Iris:MAI-Voice-2.1');
  expect(enabled()).toEqual(['speed']);
  expect(snapshot()).toEqual({});
  ui.restore({ openrouter_tts_model: mai, openrouter_tts_voice: 'en-US-Harper:MAI-Voice-2.1',
    openrouter_tts_options: { [mai]: { speed: 0.85, style: 'whispering' } } });
  expect(snapshot()).toEqual({ speed: 0.85, style: 'whispering' });
});
