import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../src/components/game/DecisionCards.jsx', import.meta.url), 'utf8');
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
