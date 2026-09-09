import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { ICON_PATHS, LEGACY_ICON_NAMES, resolveIconName, iconTextParts } from '../src/components/ui/iconData.js';
import { drawIcon } from '../src/components/ui/iconCanvas.js';
import { NOIR, noirColor } from '../src/components/ui/palette.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/lib/settingsData.js';
import { LEVEL_XP_TABLE, MAX_LEVEL, getLevelFromXP, getXPToNextLevel } from '../src/game/agentProgression.js';
import { ALL_CASES } from '../src/game/caseData.js';
import { CASE_ENERGY_COST, CASE_GOLD_REWARD, FIRST_CLEAR_DIAMONDS } from '../src/game/playerProfile.js';
import { AUTH_EMAIL_LANGUAGE_KEY } from '../src/lib/authEmail.js';

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
function load(path, imports, bindings = {}, suffix = '') {
  const { outputText } = ts.transpileModule(read(path) + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports', ...Object.keys(bindings)])(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  }, exports, ...Object.values(bindings));
  return exports;
}
const react = { ...React, default: React };
const icons = load('components/ui/Icon.jsx', { react, './iconData.js': { ICON_PATHS, resolveIconName, iconTextParts } });

test('original semantic SVG icons cover legacy authored values without changing persisted strings', () => {
  assert.ok(Object.keys(ICON_PATHS).length >= 80);
  for (const [legacy, name] of Object.entries(LEGACY_ICON_NAMES)) {
    assert.equal(resolveIconName(legacy), name);
    assert.ok(ICON_PATHS[name].every(path => typeof path === 'string' && path.length > 5));
    const html = renderToStaticMarkup(React.createElement(icons.default, { name: legacy }));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /<path d=/);
    assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);
  }
  for (const name of ['unknown', '__proto__', 'constructor', null]) assert.equal(resolveIconName(name), 'file');
  assert.equal(resolveIconName('🕵️‍♀️'), 'detective');
  assert.equal(resolveIconName('🤔'), 'brain');
  const profile = Object.freeze({ avatar: '🕵️‍♀️', detective_name: 'Detective 👩🏽‍💻' });
  renderToStaticMarkup(React.createElement(icons.default, { name: profile.avatar }));
  assert.equal(profile.avatar, '🕵️‍♀️');
  assert.equal(profile.detective_name, 'Detective 👩🏽‍💻');
});

test('icon-only actions can have a label, while text adapters preserve copy and unknown Unicode', () => {
  const html = renderToStaticMarkup(React.createElement(icons.default, { name: 'search', label: 'Search clues' }));
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Search clues"/);
  assert.doesNotMatch(html, /aria-hidden/);
  const text = '⚡ Energy 12 · 🤔 正在分析 · 🕵️‍♀️';
  assert.equal(iconTextParts(text).map(part => part.original ?? part.text).join(''), text);
  const markup = renderToStaticMarkup(React.createElement(icons.IconText, { text }));
  assert.doesNotMatch(markup, /\p{Extended_Pictographic}/u);
  assert.match(markup, /Energy 12/);
  for (const unknown of ['👩🏽‍💻', '🕵🏽‍♂️', '🕵🏽', '👨‍👩‍👧‍👦', 'Cafe\u0301 🇨🇳']) {
    assert.deepEqual(iconTextParts(unknown), [{ text: unknown }]);
  }
});

test('localized case archive footer matches the rendered current or changed catalog count', () => {
  for (const lang of ['zh', 'en']) {
    const language = load('lib/lang.jsx', { react, '@/lib/authEmail': { AUTH_EMAIL_LANGUAGE_KEY } }, {
      localStorage: { getItem: () => lang },
    });
    for (const catalog of [ALL_CASES, ALL_CASES.slice(0, 3), []]) {
      const { default: CaseSelect } = load('components/game/CaseSelect.jsx', {
        react, '@/game/caseData': { ALL_CASES: catalog },
        '@/game/playerProfile': { CASE_ENERGY_COST, CASE_GOLD_REWARD, FIRST_CLEAR_DIAMONDS },
        '@/lib/lang.jsx': language, '@/components/ui/Icon': icons, '@/components/ui/palette': { noirColor },
      });
      const markup = renderToStaticMarkup(React.createElement(language.LangProvider, null,
        React.createElement(CaseSelect, { profile: { energy: 100, solved_cases: [] } })));
      const count = (markup.match(/class="td-ui-card td-case-card\b/g) || []).length;
      assert.equal(count, catalog.length);
      const expected = lang === 'zh'
        ? `TERMINAL DETECTIVE · 案件档案 · ${count}个案件可选`
        : `TERMINAL DETECTIVE · CASE ARCHIVE · ${count} INVESTIGATIONS AVAILABLE`;
      assert.ok(markup.includes(expected), `${lang} footer must match all ${count} rendered cases`);
      assert.ok(language.LANG[lang].caseArchiveFooter.includes('{count}'));
      assert.ok(!markup.includes('{count}'), 'the localized placeholder must be resolved');
    }
  }
});

test('canvas icons use the shared vector geometry rather than font emoji', () => {
  const oldPath = globalThis.Path2D;
  const paths = [];
  globalThis.Path2D = class { constructor(path) { this.path = path; } };
  const calls = [];
  const ctx = { save: () => calls.push('save'), restore: () => calls.push('restore'), translate: (...args) => calls.push(args), scale: (...args) => calls.push(args), stroke: path => paths.push(path.path), fillText: () => assert.fail('No icon text on canvas') };
  try {
    drawIcon(ctx, '🕵️', 4, 8, 48, NOIR.brass);
    assert.deepEqual(paths, ICON_PATHS.detective);
    assert.deepEqual(calls, ['save', [4, 8], [2, 2], 'restore']);
    assert.equal(ctx.strokeStyle, NOIR.brass);
  } finally { if (oldPath === undefined) delete globalThis.Path2D; else globalThis.Path2D = oldPath; }
});

test('noir palette retains semantic differences and alpha, and does not alter unknown values', () => {
  assert.equal(noirColor('#00e5ff80'), '#709f9a80');
  assert.equal(noirColor('rgba(0, 229, 255, .25)'), 'rgba(112, 159, 154, .25)');
  assert.equal(noirColor('linear-gradient(90deg,#ff3860,#00ff88)'), 'linear-gradient(90deg,#c77c78,#8aaa91)');
  assert.equal(noirColor('#123456'), '#123456');
  assert.equal(noirColor(null), null);
  assert.notEqual(noirColor('#ff3860'), noirColor('#00ff88'));
  assert.equal(noirColor(noirColor('#a78bfa')), noirColor('#a78bfa'));
  assert.equal(DEFAULT_SETTINGS.reduceMotion, false);
  assert.equal(normalizeSettings({ reduceMotion: true }).reduceMotion, true);
});

function hooks() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  const api = { ...react,
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useEffect(callback, deps) { const i = cursor++; const prev = slots[i]; if (!prev || !deps || deps.some((dep, n) => !Object.is(dep, prev.deps[n]))) pending.push(() => { prev?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; }); },
  };
  return { api, render(fn, props) { cursor = 0; pending = []; return fn(props); }, flush() { const effects = pending; pending = []; effects.forEach(run => run()); }, cleanup() { slots.forEach(slot => slot.cleanup?.()); } };
}
function eventTarget() {
  const listeners = new Map();
  return { listeners, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name), fire: name => listeners.get(name)?.() };
}

test('motion combines game/system preferences and foreground state with listener cleanup', () => {
  const h = hooks();
  const query = { ...eventTarget(), matches: false };
  const window = { ...eventTarget(), matchMedia: () => query };
  const document = { ...eventTarget(), hidden: false, hasFocus: () => true };
  const settings = { reduceMotion: false };
  const { usePresentationMotion } = load('components/ui/usePresentationMotion.js', { react: h.api, '@/lib/settings.jsx': { useSettings: () => ({ settings }) } }, { window, document });
  assert.equal(h.render(usePresentationMotion).motionEnabled, true); h.flush();
  window.fire('blur'); assert.equal(h.render(usePresentationMotion).motionEnabled, false);
  window.fire('focus'); assert.equal(h.render(usePresentationMotion).motionEnabled, true);
  query.matches = true; query.fire('change'); assert.equal(h.render(usePresentationMotion).reducedMotion, true);
  query.matches = false; query.fire('change'); settings.reduceMotion = true;
  assert.equal(h.render(usePresentationMotion).motionEnabled, false);
  document.hidden = true; document.fire('visibilitychange'); assert.equal(h.render(usePresentationMotion).foreground, false);
  h.cleanup(); assert.equal(window.listeners.size + document.listeners.size + query.listeners.size, 0);
});

test('sliced headings preserve one accessible complete title and never require animation for visibility', () => {
  const { default: Title } = load('components/ui/SlicedTitle.jsx', { react, './usePresentationMotion.js': { usePresentationMotion: () => ({ motionEnabled: false, foreground: false }) } });
  for (const text of ['TERMINAL DETECTIVE', '案件调查结果']) {
    const html = renderToStaticMarkup(React.createElement(Title, { as: 'h1' }, text));
    assert.match(html, /data-motion-reduced="true"/);
    assert.ok(html.includes(`<span class="td-visually-hidden">${text}</span>`));
    assert.match(html, /aria-hidden="true"/);
    if (text === '案件调查结果') assert.equal((html.match(/class="td-type-word"/g) || []).length, text.length, 'CJK headings retain natural wrap points');
  }
  const css = read('index.css');
  const reveal = css.slice(css.indexOf('@keyframes td-type-reveal'), css.indexOf('.td-sliced-title[data-motion-reduced'));
  assert.match(reveal, /transform:/); assert.match(reveal, /opacity:/);
  assert.doesNotMatch(reveal, /width:|letter-spacing:|infinite|will-change/);
  assert.match(css, /data-td-motion="paused"/);
});

test('reduced/background result counters finish and XP level notifications remain exactly once', () => {
  const source = ts.createSourceFile('GameOverScreen.jsx', read('components/game/GameOverScreen.jsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const declarations = source.statements.filter(node => ts.isFunctionDeclaration(node) && ['Counter', 'XPBar'].includes(node.name?.text)).map(node => node.getText(source)).join('\n');
  let motion = false;
  const h = hooks();
  const callbacks = [];
  const bindings = { React, ...h.api, usePresentationMotion: () => ({ motionEnabled: motion }), useLang: () => ({ lang: 'en' }), LEVEL_XP_TABLE, MAX_LEVEL, getLevelFromXP, getXPToNextLevel, Icon: icons.default, LevelUpParticles: () => null, requestAnimationFrame: () => assert.fail('No animation after terminal state'), cancelAnimationFrame: () => {}, setTimeout: () => assert.fail('No delay in reduced motion'), clearTimeout: () => {} };
  const { outputText } = ts.transpileModule(declarations + '\nreturn { Counter, XPBar };', { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } });
  const { Counter, XPBar } = compileFunction(outputText, Object.keys(bindings))(...Object.values(bindings));
  const counter = h.render(Counter, { target: 145 }); h.flush();
  assert.ok(counter.props.children.includes(145));
  motion = true; h.render(Counter, { target: 145 }); h.flush(); h.cleanup();
  motion = false;
  const xp = hooks();
  Object.assign(bindings, xp.api);
  const { XPBar: Bar } = compileFunction(outputText, Object.keys(bindings))(...Object.values(bindings));
  const props = { oldXP: 0, newXP: LEVEL_XP_TABLE[3], color: NOIR.brass, agentIdx: 0, agentName: 'NEXUS', agentIcon: 'eye', onLevelUp: event => callbacks.push(event) };
  xp.render(Bar, props); xp.flush(); xp.render(Bar, props); xp.flush();
  const crossings = LEVEL_XP_TABLE.filter(value => value > props.oldXP && value <= props.newXP).length;
  assert.equal(callbacks.length, crossings);
  motion = true; xp.render(Bar, props); xp.flush();
  assert.equal(callbacks.length, crossings, 'focus cannot duplicate level modals or restart counting');
  assert.equal(typeof XPBar, 'function'); xp.cleanup();
});

test('evidence and skill canvases settle finitely, render statically with reduced motion, and stop in background', () => {
  for (const path of ['EvidenceBoard.jsx', 'SkillTreePanel.jsx']) {
    const source = ts.createSourceFile(path, read(`components/game/${path}`), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    const effects = [];
    const visit = node => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
        && node.arguments[0]?.getText(source).includes("getContext('2d')")) effects.push(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(source); assert.equal(effects.length, 1);
    const { outputText } = ts.transpileModule(`return (${effects[0].getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
    for (const [motionEnabled, foreground] of [[true, true], [false, true], [true, false]]) {
      const frames = new Map(); const timers = new Map();
      let id = 0; let draws = 0; let vectorIcons = 0;
      const ctx = {
        clearRect() { draws++; }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, setLineDash() {},
        fillText(text) { assert.equal(text, 'Evidence'); },
        createLinearGradient() { return { addColorStop() {} }; },
      };
      const canvas = { offsetWidth: 320, offsetHeight: 360, getContext: () => ctx };
      const clue = { clue_id: 'c1', keyword: 'Evidence', visual_icon: '🔬', weight: 'HIGH' };
      const bindings = {
        canvasRef: { current: canvas }, nodesRef: { current: {} }, animFrameRef: { current: null }, frameRef: { current: null },
        freshnessTimersRef: { current: timers }, motionEnabled, foreground, unlockedClues: [clue], unlockedIds: ['c1'], validEdges: [],
        NODE_COLORS: { HIGH: NOIR.warning }, noirColor, drawIcon() { vectorIcons++; }, CANVAS_W: 320, CANVAS_H: 360, color: NOIR.teal,
        skills: [{ id: 's1' }, { id: 's2' }], equippedIds: ['s1'], unlockedByLevel: ['s2'], positions: [{ x: 60, y: 60 }, { x: 180, y: 180 }],
        requestAnimationFrame(callback) { frames.set(++id, callback); return id; }, cancelAnimationFrame(frame) { frames.delete(frame); },
        setTimeout(callback) { timers.set(++id, callback); return id; },
      };
      const run = compileFunction(outputText, Object.keys(bindings))(...Object.values(bindings));
      const cleanup = run();
      if (!foreground) { assert.equal(draws, 0); assert.equal(frames.size, 0); continue; }
      assert.equal(draws, 1);
      if (!motionEnabled) assert.equal(frames.size, 0);
      else {
        for (let tick = 0; frames.size && tick < 120; tick++) {
          const [frame, callback] = frames.entries().next().value;
          frames.delete(frame); callback(tick * 16);
        }
        assert.equal(draws, 90); assert.equal(frames.size, 0);
        run()(); assert.equal(frames.size, 0, 'cleanup cancels active animation');
      }
      if (path === 'EvidenceBoard.jsx') assert.equal(vectorIcons, draws);
      cleanup();
    }
  }
});

test('narrow registration keeps shrinkable fields and semantic keyboard avatar controls', () => {
  const registration = read('components/game/DetectiveRegistration.jsx');
  const css = read('index.css');
  assert.match(registration, /minmax\(180px,210px\) minmax\(0,1fr\) minmax\(210px,250px\)/);
  assert.match(registration, /flex: 1, minWidth: 0, background:/);
  assert.match(registration, /flex: 1, minWidth: 0, display: 'flex'.*overflowX: 'auto'/);
  assert.match(css, /\.td-registration-grid \{ grid-template-columns: minmax\(0,1fr\) !important; \}/);
  assert.match(css, /\.td-registration-grid > \* \{ min-width: 0; \}/);
  assert.match(registration, /aria-label=\{AVATAR_OPTIONS\[i\]\[lang\]\}/);
  assert.match(registration, /aria-pressed=\{i === avatarIdx\}/);
  const cinematic = read('components/game/cinematics/ActionCinematic.jsx');
  assert.match(cinematic, /frameloop=\{motionEnabled \? 'always' : 'demand'\}/);
  assert.match(cinematic, /visiblePhase = reducedMotion \? 'result' : phase/);
});

test('synergy notifications clean up audio on blur and retain a single completion timer', () => {
  const h = hooks();
  const timers = new Map();
  const contexts = [];
  let foreground = true;
  let completed = 0;
  let timerId = 0;
  const settings = { sfxEnabled: false, particles: false };
  const gain = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; contexts.push(this); }
    createOscillator() { return { frequency: {}, connect: () => ({ connect() {} }), start() {}, stop() {} }; }
    createGain() { return { gain: gain() }; }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const { default: Notification } = load('components/game/SynergyUnlockFX.jsx', {
    react: h.api, '@/lib/lang.jsx': { useLang: () => ({ lang: 'en' }) },
    '@/components/ui/Icon': icons, '@/components/ui/palette': { noirColor },
    '@/lib/settings.jsx': { useSettings: () => ({ settings }) },
    '@/components/ui/usePresentationMotion': { usePresentationMotion: () => ({ motionEnabled: false, foreground }) },
  }, {
    window: { AudioContext },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  const props = { skill: { icon: 'link', color: '#00e5ff', nameEn: 'Cross validation' }, onDone: () => completed++ };
  h.render(Notification, props); h.flush();
  assert.equal(contexts.length, 0, 'sound setting is honored');
  assert.deepEqual([...timers.values()].map(timer => timer.ms), [2800]);
  settings.sfxEnabled = true; h.render(Notification, props); h.flush();
  assert.equal(contexts.length, 1);
  foreground = false; h.render(Notification, props); h.flush();
  assert.equal(contexts[0].state, 'closed');
  assert.deepEqual([...timers.values()].map(timer => timer.ms), [2800]);
  foreground = true; h.render(Notification, props); h.flush();
  assert.equal(contexts.length, 1, 'focus does not replay the chord');
  for (const [id, timer] of timers) { timers.delete(id); timer.fn(); }
  assert.equal(completed, 1);
  h.cleanup(); assert.equal(timers.size, 0);
});

test('level-up dialog supports keyboard containment, Escape and focus restoration', () => {
  const h = hooks();
  let closed = 0;
  const document = { activeElement: null };
  class Element {
    constructor() { this.isConnected = true; }
    focus() { document.activeElement = this; }
  }
  const previous = new Element(); previous.focus();
  const first = new Element(); const last = new Element();
  const dialog = Object.assign(new Element(), eventTarget(), { querySelectorAll: () => [first, last] });
  const { default: Modal } = load('components/game/LevelUpModal.jsx', {
    react: h.api, '@/lib/lang.jsx': { useLang: () => ({ lang: 'en' }) },
    '@/components/ui/Icon': icons, '@/components/ui/palette': { noirColor },
    '@/lib/settings.jsx': { useSettings: () => ({ settings: { particles: false } }) },
    '@/components/ui/usePresentationMotion': { usePresentationMotion: () => ({ motionEnabled: false }) },
  }, { document, HTMLElement: Element });
  const root = h.render(Modal, { color: '#00e5ff', fromLevel: 1, toLevel: 2, newSkills: [], onClose: () => closed++ });
  const children = React.Children.toArray(root.props.children);
  const card = children.find(node => node.props?.role === 'dialog');
  card.ref.current = dialog; h.flush();
  assert.equal(document.activeElement, dialog);
  let prevented = 0;
  const key = (value, shiftKey = false) => dialog.listeners.get('keydown')({ key: value, shiftKey, preventDefault: () => prevented++ });
  key('Tab', true); assert.equal(document.activeElement, last);
  key('Tab'); assert.equal(document.activeElement, first);
  assert.equal(prevented, 2);
  key('Escape'); key('Escape'); assert.equal(closed, 1);
  h.cleanup(); assert.equal(document.activeElement, previous);
  assert.equal(dialog.listeners.size, 0);
});
