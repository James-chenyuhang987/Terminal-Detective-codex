import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../src/components/game/DecisionCards.jsx', import.meta.url), 'utf8');
const terminal = readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('decision layer renders through a body portal and resets its own scroll position', () => {
  assert.match(component, /createPortal\(dialog, document\.body\)/);
  assert.match(component, /overlay\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
});

test('decision layer does not lock document scrolling or restore the split fixed layout', () => {
  assert.doesNotMatch(component, /document\.(body|documentElement)\.style\.overflow/);
  assert.doesNotMatch(component, /td-decision-fixed-(top|body)/);
  assert.doesNotMatch(styles, /\.td-decision-fixed-(top|body)/);
});

test('mobile confirmation controls remain in normal document flow', () => {
  assert.match(styles, /\.td-decision-order-row \{ position: static;/);
  assert.doesNotMatch(styles, /\.td-decision-order-row \{ position: sticky;/);
});

test('decision workspace keeps the complete story left of all controls on desktop', () => {
  assert.match(component, /td-decision-workspace/);
  assert.match(component, /td-decision-story-column[\s\S]*<StoryBriefing[\s\S]*td-decision-controls[\s\S]*td-decision-cards/);
  assert.match(styles, /\.td-decision-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(320px,\s*420px\)\s*minmax\(0,\s*980px\)/);
  assert.match(styles, /\.td-decision-story-column\s*\{[\s\S]*position:\s*sticky;[\s\S]*overflow-y:\s*auto;/);
});

test('narrow decision workspace stacks story and controls without nested scrolling', () => {
  assert.match(styles, /@media \(max-width: 1180px\)\s*\{[\s\S]*\.td-decision-workspace[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /@media \(max-width: 1180px\)\s*\{[\s\S]*\.td-decision-story-column\s*\{[^}]*position:\s*static;[^}]*overflow:\s*visible;/);
});

test('investigation loop streams story then thought before opening the decision desk', () => {
  const prefetch = terminal.indexOf('const optionPacksPromise = getDecisionOptionPacks');
  const storyStream = terminal.indexOf('await streamTerminalText');
  const thoughtStream = terminal.indexOf('await streamInvestigationThought');
  const openDecision = terminal.indexOf('setDecisionCards(packs)');

  assert.ok(prefetch > 0 && prefetch < storyStream);
  assert.ok(storyStream < thoughtStream);
  assert.ok(thoughtStream < openDecision);
  assert.match(terminal, /story:\s*publicStory[\s\S]*setDecisionStory\(\{[\s\S]*\.\.\.publicStory/);
  assert.match(terminal, /const runLang = [\s\S]*getDecisionOptionPacks\(\{[\s\S]*lang:\s*runLang[\s\S]*streamInvestigationThought\(\{[\s\S]*lang:\s*runLang[\s\S]*settleAction\(\{[\s\S]*lang:\s*runLang/);
  assert.match(component, /const lang = language === 'en' \|\| language === 'zh' \? language : currentLang/);
  assert.match(terminal, /prefers-reduced-motion: reduce/);
  assert.match(terminal, /aria-hidden="true"[\s\S]*td-sr-only/);
});
