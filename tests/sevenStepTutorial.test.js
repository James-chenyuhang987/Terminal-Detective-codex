import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/game/OnboardingGuide.jsx', import.meta.url), 'utf8');

test('investigation onboarding contains seven steps with a standalone ability lesson', () => {
  const titles = [...source.slice(source.indexOf('const STEPS ='), source.indexOf('const FIELD_STEPS =')).matchAll(/\bt:\s*'([^']+)'/g)].map(match => match[1]);
  const chineseTitles = titles.filter(title => /[\u3400-\u9fff]/u.test(title));
  assert.equal(chineseTitles.length, 7);
  assert.match(source, /探员的能力会决定每一次提问是否贴近事实哦。/);
  assert.match(source, /An agent’s ability determines how closely each question aligns with the facts\./);
  assert.match(source, /abilityDemo:\s*true/);
  assert.match(source, /58%/);
  assert.match(source, /84%/);
  assert.match(source, /i \+ 1\}\/\{steps\.length\}/);
});


test('V2 tutorial teaches five field stages without changing the seven-step legacy course', () => {
  const field = source.slice(source.indexOf('const FIELD_STEPS ='), source.indexOf('function clamp('));
  const titles = [...field.matchAll(/\bt:\s*'([^']+)'/g)].map(match => match[1]);
  assert.equal(titles.filter(title => /[\u3400-\u9fff]/u.test(title)).length, 5);
  assert.match(field, /WASD/);
  assert.match(field, /免费复查/);
  assert.match(field, /错误关系可以修正/);
});
