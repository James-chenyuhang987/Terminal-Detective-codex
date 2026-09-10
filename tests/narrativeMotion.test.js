import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { segmentNarrativeText, narrativeTextTiming } from '../src/game/narrativeMotion.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function component(path, imports, bindings = {}) {
  const { outputText } = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports', ...Object.keys(bindings)])(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  }, exports, ...Object.values(bindings));
  return exports.default || exports.NPCDialogBox;
}
const NarrativeText = component('src/components/game/theater/NarrativeText.jsx', {
  '@/lib/settings.jsx': { useSettings: () => ({ settings: { reduceMotion: false } }) },
  react: { ...React, default: React, useMemo: callback => callback(), useRef: value => ({ current: value }), useLayoutEffect: () => {} },
  '@/game/narrativeMotion': { segmentNarrativeText, narrativeTextTiming }, './narrativeText.css': {},
});

for (const lang of ['en', 'zh']) {
  test(`word segmentation preserves ${lang} text, punctuation, paragraphs and Unicode`, () => {
    for (const text of ['', 'Archive 07\n\nThe rain won’t stop.  Read carefully.', '档案·霓虹\n“证词不是事实。”\n\n继续调查。', 'Cafe\u0301 👩🏽‍💻 / 👨‍👩‍👧‍👦 / 🇨🇳']) {
      const tokens = segmentNarrativeText(text, lang);
      assert.equal(tokens.map(item => item.text).join(''), text);
      assert.equal(tokens.at(-1)?.end || 0, Array.from(text).length);
      for (const emoji of ['👩🏽‍💻', '👨‍👩‍👧‍👦', '🇨🇳', 'e\u0301']) {
        if (text.includes(emoji)) assert.ok(tokens.some(token => token.text.includes(emoji)), `split ${emoji}`);
      }
      assert.equal(tokens.filter(token => token.whitespace).map(token => token.text).join(''), text.match(/\s+/gu)?.join('') || '');
    }
  });
}

test('unsupported Segmenter falls back to intact whitespace-delimited runs without splitting emoji', () => {
  const source = read('src/game/narrativeMotion.js').replaceAll('export function', 'function');
  const fallback = compileFunction(`${source}; return segmentNarrativeText;`, ['Intl'])({});
  const text = '证词👩🏽‍💻\nCafe\u0301 👨‍👩‍👧‍👦';
  assert.equal(fallback(text).map(token => token.text).join(''), text);
  assert.ok(fallback(text).some(token => token.text === '证词👩🏽‍💻'));
});

test('actual text component reserves the entire passage and reveals complete words with stable keys', () => {
  const props = { text: 'Read the file.\n证词。', lang: 'en', visibleCount: 4 };
  const initial = NarrativeText(props);
  const final = NarrativeText({ ...props, visibleCount: Infinity });
  assert.equal(initial.props['aria-hidden'], 'true');
  assert.equal(initial.props.children.map(child => typeof child === 'string' ? child : child.props.children).join(''), props.text);
  const spans = initial.props.children.filter(child => typeof child !== 'string');
  assert.deepEqual(spans.filter(child => child.props.className.includes('is-visible')).map(child => child.props.children), ['Read']);
  assert.deepEqual(spans.map(child => child.key), final.props.children.filter(child => typeof child !== 'string').map(child => child.key));
  for (const variant of ['title', 'dialogue']) {
    const long = NarrativeText({ text: 'archive '.repeat(200), lang: 'en', variant });
    const delays = long.props.children.filter(child => typeof child !== 'string').map(child => narrativeTextTiming(variant, child.props['data-token']).delay);
    assert.ok(Math.max(...delays) <= (variant === 'title' ? 420 : 560));
  }
});

function eventTarget() {
  const listeners = new Map();
  return { listeners, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name), fire: name => listeners.get(name)?.() };
}
function statementHarness() {
  const effects = [];
  const state = [];
  let cursor = 0;
  const document = { ...eventTarget(), hidden: false, hasFocus: () => true };
  const window = eventTarget();
  const Statement = component('src/components/game/theater/NPCStatement.jsx', {
    react: { ...React, default: React, useEffect: callback => effects.push(callback), useState: value => {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = typeof value === 'function' ? value() : value;
      return [state[slot], next => { state[slot] = next; }];
    } }, './NarrativeText': { default: NarrativeText },
  }, { document, window });
  return { document, window, effects, render: props => { cursor = 0; effects.length = 0; return Statement({ text: 'A recorded answer.', lang: 'en', ...props }); } };
}

test('NPC text pauses on Home/settings and browser blur without mutating gameplay or restarting history', () => {
  const h = statementHarness();
  let result = h.render({ animate: true });
  const cleanup = h.effects[0]();
  assert.equal(result.props['data-text-paused'], false);
  h.window.fire('blur');
  assert.equal(h.render({ animate: false }).props['data-text-paused'], true);
  h.window.fire('focus');
  result = h.render({ animate: false });
  assert.equal(result.props['data-text-instant'], false, 'appending a new answer keeps the mounted animation, rather than restarting it');
  assert.equal(result.props['data-text-paused'], false);
  assert.equal(h.render({ active: false }).props['data-text-paused'], true);
  h.document.hidden = true; h.document.fire('visibilitychange');
  assert.equal(h.render({}).props['data-text-paused'], true);
  cleanup();
  assert.equal(h.window.listeners.size + h.document.listeners.size, 0);
});

test('NPC Show all is immediate, history remains readable, and accessible text is static', () => {
  const h = statementHarness();
  const result = h.render({ animate: true, showAll: true });
  assert.equal(result.props['data-text-instant'], true);
  assert.equal(result.props.children[1].props.children, 'A recorded answer.');
  assert.equal(h.render({ lang: 'zh' }).props.children[0].props.lang, 'en', 'changing UI language must not replay an unchanged recorded answer');
  const history = statementHarness();
  history.render({ animate: false });
  assert.equal(history.render({ animate: true }).props['data-text-instant'], true, 'old history cannot start animating after rerender');
  assert.doesNotMatch(read('src/components/game/theater/NPCStatement.jsx'), /aria-live|onQuestion|fetch\(|setGameState|onComplete/);
});

test('actual NPC panel animates only appended answers and Show all never dispatches a question', () => {
  const refs = [];
  let cursor = 0;
  let revealed;
  let asked = 0;
  let closed = 0;
  const Statement = () => null;
  const Panel = component('src/components/game/investigation/TerminalPanels.jsx', {
    react: { ...React, useRef: value => {
      const slot = cursor++;
      if (!(slot in refs)) refs[slot] = { current: value };
      return refs[slot];
    }, useState: value => { revealed ??= value; return [revealed, next => { revealed = next; }]; }, useEffect: () => {} },
    '@/components/game/theater/NPCStatement': { default: Statement },
    '@/components/ui/Icon': { default: () => null, IconText: ({ text }) => text },
    '@/components/ui/palette': { noirColor: color => color },
    '@/lib/lang.jsx': { useLang: () => ({ lang: 'en', t: { interrogating: 'Interrogating', close: 'Close' } }) },
    '@/components/game/InterrogationHints': { EmotionBadge: () => null },
    '@/components/game/AgentStaminaMeter': { default: () => null },
    '@/game/agentStamina': { AGENT_STAMINA_INVESTIGATION_COST: 10, canAgentInvestigate: stamina => stamina >= 10 },
  }, { React });
  const entries = [{ role: 'system', text: 'Opening' }, { role: 'npc', text: 'Recovered answer' }];
  const props = { npc: { npc_id: 'npc-1' }, dialogue: entries, executorId: 'AXIOM',
    team: [{ agent_id: 'AXIOM', stamina: 100 }], packs: { AXIOM: { questions: [{ questionId: 'q1', text: 'A question' }] } },
    storyMotion: true, onQuestion: () => asked++, onClose: () => closed++, onExecutorChange: () => {} };
  const descendants = (node, predicate) => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => descendants(child, predicate));
    return [...(predicate(node) ? [node] : []), ...descendants(node.props?.children, predicate)];
  };
  const render = (extra = {}) => { cursor = 0; return Panel({ ...props, ...extra }); };
  const statements = root => descendants(root, node => node.type === Statement);
  let root = render();
  assert.ok(statements(root).every(node => !node.props.animate));
  props.dialogue = [...entries, { role: 'npc', text: 'New confirmed answer' }];
  root = render({ presentationActive: false });
  assert.deepEqual(statements(root).map(node => node.props.animate), [false, false, true]);
  assert.ok(statements(root).every(node => node.props.active === false));
  descendants(root, node => node.props?.className === 'td-npc-reveal')[0].props.onClick();
  assert.equal(asked + closed, 0);
  assert.ok(statements(render()).every(node => node.props.showAll));
  props.dialogue = [...props.dialogue, { role: 'npc', text: 'Another confirmed answer' }];
  root = render();
  assert.equal(statements(root).at(-1).props.showAll, false);
  descendants(root, node => node.type === 'button' && node.key === 'q1')[0].props.onClick();
  assert.equal(asked, 1);
  descendants(root, node => node.props?.['aria-label'] === 'Close')[0].props.onClick();
  assert.equal(closed, 1);
  assert.equal(statements(render({ storyMotion: false })).length, 0);
});

function textAnimationHarness({ supported = true, reduced = false, gameReduced = false } = {}) {
  const effects = [];
  const refs = [];
  let cursor = 0;
  const played = [];
  const query = { ...eventTarget(), matches: reduced };
  const element = index => ({ dataset: { token: String(index) }, animate: supported ? (_frames, timing) => {
    const animation = { timing, playState: 'running', time: 0, plays: 0, cancelled: false,
      pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; this.plays++; },
      finish() { this.playState = 'finished'; }, cancel() { this.cancelled = true; },
    };
    played.push(animation);
    return animation;
  } : undefined });
  const spans = [element(0), element(2), element(4)];
  let visible = 1;
  const node = { ...element(-1), querySelectorAll: () => spans.slice(0, visible) };
  const Text = component('src/components/game/theater/NarrativeText.jsx', {
    '@/lib/settings.jsx': { useSettings: () => ({ settings: { reduceMotion: gameReduced } }) },
    react: { ...React, default: React, useMemo: callback => callback(), useRef: value => {
      const slot = cursor++;
      if (!(slot in refs)) refs[slot] = { current: value };
      return refs[slot];
    }, useLayoutEffect: callback => effects.push(callback) },
    '@/game/narrativeMotion': { segmentNarrativeText, narrativeTextTiming }, './narrativeText.css': {},
  }, { window: { matchMedia: () => query } });
  return { played, query, effects, refs, render(props = {}) {
    cursor = 0; effects.length = 0;
    const result = Text({ text: 'Read this archive.', lang: 'en', ...props });
    refs[0].current = node;
    return result;
  }, reveal(count) { visible = count; effects[1](); } };
}

test('actual animation effect pauses the same native instances and never restarts completed words', () => {
  const h = textAnimationHarness();
  h.render({ variant: 'title' });
  const cleanup = h.effects[0]();
  h.reveal(1);
  assert.equal(h.played.length, 2);
  h.played[1].time = 160;
  h.render({ variant: 'title', paused: true }); h.reveal(1);
  assert.ok(h.played.every(animation => animation.playState === 'paused'));
  h.render({ variant: 'title', paused: false }); h.reveal(2);
  assert.equal(h.played.length, 3, 'only the newly visible word acquires an animation');
  assert.equal(h.played[1].time, 160, 'hide/resume never resets time');
  assert.equal(h.played[1].plays, 1);
  h.played.forEach(animation => animation.finish());
  h.render({ variant: 'title', paused: true }); h.reveal(2);
  h.render({ variant: 'title', paused: false }); h.reveal(2);
  assert.ok(h.played.every(animation => animation.playState === 'finished'));
  cleanup();
  assert.ok(h.played.every(animation => animation.cancelled));
  assert.equal(h.query.listeners.size, 0);
  assert.equal(h.refs[1].current.size, 0);
});

test('Show all and live reduced motion finish paused animations; new words never acquire motion', () => {
  const h = textAnimationHarness();
  h.render({ paused: true });
  const cleanup = h.effects[0](); h.reveal(1);
  assert.equal(h.played[0].playState, 'paused');
  h.render({ paused: true, instant: true }); h.reveal(3);
  assert.equal(h.played[0].playState, 'finished');
  assert.equal(h.played.length, 1);
  cleanup();
  const motion = textAnimationHarness();
  motion.render({ paused: true }); const stop = motion.effects[0](); motion.reveal(1);
  motion.query.matches = true; motion.query.fire('change');
  assert.equal(motion.played[0].playState, 'finished');
  motion.reveal(3);
  assert.equal(motion.played.length, 1);
  stop();
});

test('missing native animation and initial reduced motion retain immediately visible text', () => {
  for (const options of [{ supported: false }, { reduced: true }, { gameReduced: true }]) {
    const h = textAnimationHarness(options);
    const text = h.render({ variant: 'title' });
    const cleanup = h.effects[0](); h.reveal(3);
    assert.equal(h.played.length, 0);
    assert.ok(text.props.children.filter(child => typeof child !== 'string').every(child => child.props.className.includes('is-visible')));
    cleanup();
  }
});

test('native animation is bounded, reduced-motion safe and scoped to presentation text', () => {
  const css = read('src/components/game/theater/narrativeText.css');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-text-instant="true"[\s\S]*opacity: 1 !important/);
  assert.doesNotMatch(css, /inline-block/, 'inline tokens preserve native punctuation and long-word wrapping');
  assert.doesNotMatch(css, /infinite|filter:|will-change/);
  const overlay = read('src/components/game/theater/NarrativeOverlay.jsx');
  assert.match(overlay, /data-text-paused=\{!active \|\| !foreground \|\| busy\}/);
  assert.match(overlay, /complete: true, instant: true/);
  const owner = read('src/components/game/InvestigationTerminal.jsx');
  assert.match(owner, /storyMotion=\{theaterMode\}/);
  assert.match(owner, /presentationActive=\{presentationActive && !showSettings\}/);
});
