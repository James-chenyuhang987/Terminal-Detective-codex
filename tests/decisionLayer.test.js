import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../src/components/game/DecisionCards.jsx', import.meta.url), 'utf8');
const storyBriefing = readFileSync(new URL('../src/components/game/StoryBriefing.jsx', import.meta.url), 'utf8');
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

test('decision workspace keeps the complete story above all controls', () => {
  assert.match(component, /td-decision-workspace/);
  assert.match(component, /td-decision-story-column[\s\S]*<StoryBriefing[\s\S]*td-decision-controls[\s\S]*td-decision-cards/);
  assert.match(styles, /\.td-decision-workspace\s*\{[^}]*display:\s*flex;[^}]*width:\s*min\(980px,\s*100%\);[^}]*flex-direction:\s*column;/);
  assert.match(styles, /\.td-decision-story-column\s*\{[^}]*position:\s*static;[^}]*width:\s*100%;[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/);
  assert.match(styles, /\.td-decision-controls\s*\{[^}]*width:\s*100%;[^}]*flex-direction:\s*column;/);
  assert.match(terminal, /transcript:\s*observationTerminalText/);
  assert.match(storyBriefing, /story\.transcript[\s\S]*【剧情内容】[\s\S]*td-story-transcript[\s\S]*\{transcript\}/);
  assert.doesNotMatch(storyBriefing, /SceneIllustration/);
  assert.match(styles, /\.td-story-transcript > p\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*white-space:\s*pre-wrap;/);
});

test('decision story uses the outer dialog scroll instead of a nested story scrollbar', () => {
  assert.match(styles, /\.td-decision-overlay\s*\{[\s\S]*overflow-y:\s*auto;/);
  assert.doesNotMatch(styles, /\.td-decision-story-column\s*\{[^}]*overflow-y:\s*auto;/);
});

test('investigation loop streams the complete observation then thought before opening the decision desk', () => {
  const prefetch = terminal.indexOf('const optionPacksPromise = getDecisionOptionPacks');
  const observationStream = terminal.indexOf('await streamTerminalText');
  const thoughtStream = terminal.indexOf('await streamInvestigationThought');
  const openDecision = terminal.indexOf('setDecisionCards(packs)');

  assert.ok(prefetch > 0 && prefetch < observationStream);
  assert.ok(observationStream < thoughtStream);
  assert.ok(thoughtStream < openDecision);
  assert.match(terminal, /observationTerminalText,\s*\} = generateObservationSections/);
  assert.match(terminal, /streamTerminalText\(\{\s*text:\s*observationTerminalText/);
  assert.match(terminal, /text:\s*observationTerminalText,\s*intervalMs:\s*18,\s*instant:\s*false/);
  assert.match(terminal, /addLine\(observationTerminalText,\s*'observe'\)/);
  assert.doesNotMatch(terminal, /addLine\(`◈ \$\{t\.turnLabel\}.*observationPhase.*'phase'\)/);
  assert.match(terminal, /story:\s*publicStory[\s\S]*setDecisionStory\(\{[\s\S]*\.\.\.publicStory/);
  assert.match(terminal, /const runLang = [\s\S]*getDecisionOptionPacks\(\{[\s\S]*lang:\s*runLang[\s\S]*streamInvestigationThought\(\{[\s\S]*lang:\s*runLang[\s\S]*settleAction\(\{[\s\S]*lang:\s*runLang/);
  assert.match(component, /const lang = language === 'en' \|\| language === 'zh' \? language : currentLang/);
  assert.match(terminal, /prefers-reduced-motion: reduce/);
  assert.match(terminal, /aria-hidden="true"[\s\S]*td-sr-only/);
});

test('decision and interrogation layers expose stamina, costs, and depleted recovery', () => {
  assert.match(component, /AgentStaminaMeter/);
  assert.match(component, /canAgentInvestigate\(agent\.stamina,\s*true\)/);
  assert.match(component, /chooseOnce\(\{ rest: true \}\)/);
  assert.match(component, /参与者 -\$\{AGENT_STAMINA_INVESTIGATION_COST\}%/);
  assert.match(terminal, /applyStaminaToTeam\(configuredAgentStrategy\.team,\s*gameState\.agent_stamina\)/);
  assert.match(terminal, /recoverAgentStaminaTurn\(gs\.agent_stamina,\s*teamIds\)/);
  assert.match(terminal, /team:\s*roundAgentStrategy\.team/);
  assert.match(terminal, /buildExecutingStrategy\(\s*roundAgentStrategy/);
  assert.match(terminal, /spendAgentStamina/);
  assert.match(terminal, /applyRecoveryTurn/);
  assert.match(styles, /\.td-agent-stamina\s*\{/);
  assert.match(styles, /\.td-stamina-warning\s*\{/);
  assert.match(styles, /\.td-npc-stamina-note\s*\{/);
});
