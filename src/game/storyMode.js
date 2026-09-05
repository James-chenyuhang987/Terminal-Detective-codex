export const STORY_MODES = Object.freeze(['theater', 'terminal']);
export const DEFAULT_STORY_MODE = 'terminal';

export function normalizeStoryMode(value) {
  return value === 'theater' || value === 'terminal' ? value : DEFAULT_STORY_MODE;
}
