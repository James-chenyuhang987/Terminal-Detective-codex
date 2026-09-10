import { DEFAULT_STORY_MODE, normalizeStoryMode } from '../game/storyMode.js';

/** @typedef {{ storyMode: 'terminal' | 'theater', panelLight: boolean, sfxEnabled: boolean, scanlines: boolean, reduceMotion: boolean, glitchLevel: 'off' | 'low' | 'high', particles: boolean, investigationTutorialEnabled: boolean, cinematicsEnabled: boolean, cinematicQuality: 'auto' | 'low' | 'high' }} Settings */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  storyMode: DEFAULT_STORY_MODE,
  panelLight: false,
  sfxEnabled: true,
  scanlines: true,
  reduceMotion: false,
  glitchLevel: 'high',
  particles: true,
  investigationTutorialEnabled: true,
  cinematicsEnabled: true,
  cinematicQuality: 'auto',
});

export const MAX_SETTINGS_IMPORT_BYTES = 1_048_576;

/** @returns {Settings} */
export function normalizeSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return /** @type {Settings} */ (Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => {
    const candidate = Object.hasOwn(source, key) ? source[key] : undefined;
    if (typeof fallback === 'boolean') return [key, typeof candidate === 'boolean' ? candidate : fallback];
    if (key === 'storyMode') return [key, normalizeStoryMode(candidate)];
    const allowed = key === 'glitchLevel' ? ['off', 'low', 'high'] : ['auto', 'low', 'high'];
    return [key, allowed.includes(candidate) ? candidate : fallback];
  })));
}

export function parseSettingsImport(text) {
  if (typeof text !== 'string' || text.length > MAX_SETTINGS_IMPORT_BYTES) throw new Error('Invalid settings import.');
  const data = JSON.parse(text);
  if (data?.format !== 'terminal-detective-profile' || data.schema_version !== 2
    || !data.local?.settings || typeof data.local.settings !== 'object' || Array.isArray(data.local.settings)) {
    throw new Error('Invalid settings import.');
  }
  return normalizeSettings(data.local.settings);
}
