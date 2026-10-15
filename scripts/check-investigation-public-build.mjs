#!/usr/bin/env node
// Run only in the repository: this Node-only audit imports private server content
// to compare it with emitted browser strings. Do not import this script from src.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
import { CASE_DESIGN_REVISION } from '../server/investigationV2/caseDesign.js';
import { getInterviewStrategyContent } from '../server/investigationV2/interviewContent.js';
import { REPORT_EXPLANATION_REVISION, publicReportEvidenceRoles } from '../server/investigationV2/reportExplanation.js';
import { ALL_CASES } from '../src/game/caseData.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');
const buildRoot = path.join(root, 'dist', 'assets');
const output = path.join(root, 'docs', 'verification', 'v2-public-build.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const relative = absolute => path.relative(root, absolute).split(path.sep).join('/');

async function filesIn(directory, pattern) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(absolute, pattern)
      : entry.isFile() && pattern.test(entry.name) ? [absolute] : [];
  }));
  return children.flat().sort();
}

function builtStrings(source) {
  const tree = ts.createSourceFile('browser-bundle.js', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  if (tree.parseDiagnostics.length) throw new Error('Browser JavaScript could not be parsed; refusing an incomplete privacy audit.');
  const strings = [];
  function visit(node) {
    if ([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
      ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(node.kind)) {
      // The AST identifies real literals (rather than quote characters inside
      // regular expressions). Scan each token to decode minifier escapes, and
      // rescan template middle/tail tokens after their leading closing brace.
      const scanner = ts.createScanner(ts.ScriptTarget.ESNext, true, ts.LanguageVariant.Standard, node.getText(tree));
      scanner.scan();
      if ([ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(node.kind)) scanner.reScanTemplateToken(false);
      strings.push(scanner.getTokenValue());
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return strings;
}

function sourceImports(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.ESNext, true,
    /\.[jt]sx$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  const imports = [];
  const add = node => {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) imports.push(node.text);
  };
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return imports;
}

// Validate decoding independently of the no-match result, including the escapes
// emitted by a minifier. These sentinel words are not part of the private corpus.
const decodingFixture = builtStrings('const a="\\u6838\\u9a8c"; const b="test\\x20phrase"; const c=`template phrase`; const d=`head ${a} middle\\x20phrase ${b} tail\\x20phrase`;');
if (!decodingFixture.includes('核验') || !decodingFixture.includes('test phrase') || !decodingFixture.includes('template phrase')
  || !decodingFixture.includes(' middle phrase ') || !decodingFixture.includes(' tail phrase')) {
  throw new Error('JavaScript string decoding failed; this build cannot be audited.');
}

const categoryNames = ['testimony_response', 'hidden_result', 'wrong_outcome', 'expert_observation',
  'investigation_result', 'confirmed_proposition', 'failure_explanation', 'conditional_story_focus',
  'story_milestone', 'story_sequence', 'story_aftermath', 'report_evidence_scope',
  'interview_background', 'interview_claim', 'conditional_interview_prompt',
  'legacy_clue_description', 'legacy_conflict_reason'];
const emptyCategories = () => Object.fromEntries(categoryNames.map(name => [name, []]));
const categories = emptyCategories();
const coverage = [];
const contentRevisions = [0, CASE_DESIGN_REVISION];
if (CASE_DESIGN_REVISION !== 1 || INVESTIGATION_CASE_IDS.length !== 8 || new Set(INVESTIGATION_CASE_IDS).size !== 8) {
  throw new Error('Case revisions or catalog changed; review privacy coverage before accepting a build.');
}
function addBilingual(corpus, category, value) {
  for (const lang of ['zh', 'en']) {
    const phrase = value?.[lang];
    if (typeof phrase !== 'string' || !phrase.trim()) throw new Error(`Private ${category} lacks bilingual text.`);
    corpus[category].push(phrase);
  }
}
for (const revision of contentRevisions) {
  const corpus = emptyCategories();
  const cases = [];
  for (const caseId of INVESTIGATION_CASE_IDS) {
    const content = getInvestigationContent(caseId, revision);
    if (!content) throw new Error(`Missing private case content: ${caseId}, revision ${revision}.`);
    for (const stages of Object.values(content.testimonies)) {
      for (const stage of stages) {
        for (const field of ['response', 'gentle_response', 'firm_response']) {
          addBilingual(corpus, 'testimony_response', stage[field]);
        }
      }
    }
    addBilingual(corpus, 'hidden_result', content.hidden.result);
    for (const outcome of Object.values(content.report.wrong_outcomes)) addBilingual(corpus, 'wrong_outcome', outcome);
    for (const target of content.targets.filter(item => !item.hidden)) addBilingual(corpus, 'investigation_result', target.result);
    for (const proposition of content.relations) addBilingual(corpus, 'confirmed_proposition', proposition.label);
    for (const target of [...content.targets, content.hidden]) {
      if (target.expert_note) addBilingual(corpus, 'expert_observation', target.expert_note.text);
      if (target.failure_explanation) addBilingual(corpus, 'failure_explanation', target.failure_explanation);
    }
    const design = content.case_design;
    if (revision === CASE_DESIGN_REVISION) {
      if (!design || design.focus?.length !== 3 || !design.pursuit?.length || !design.convergence?.length) {
        throw new Error(`Missing conditional story coverage for ${caseId}.`);
      }
      // Opening focus is intentionally public at entry. Only later focus text
      // is gated by discovered evidence and belongs in the private corpus.
      for (const focus of design.focus.slice(1)) addBilingual(corpus, 'conditional_story_focus', focus);
      for (const field of ['milestones', 'sequence', 'aftermath']) {
        if (!design[field]?.length) throw new Error(`Missing ${field} coverage for ${caseId}.`);
        for (const entry of design[field]) {
          if (!entry.id || !entry.evidence_ids?.length) throw new Error(`Ungated ${field} entry in ${caseId}.`);
          addBilingual(corpus, `story_${field === 'milestones' ? 'milestone' : field}`, entry.title);
          addBilingual(corpus, `story_${field === 'milestones' ? 'milestone' : field}`, entry.body);
        }
      }
    } else if (design) {
      throw new Error(`Frozen case revision ${revision} unexpectedly contains new story content.`);
    }
    cases.push({ case_id: caseId, conditional_focus: design ? design.focus.length - 1 : 0,
      milestones: design?.milestones.length || 0, sequence: design?.sequence.length || 0,
      aftermath: design?.aftermath.length || 0 });
  }
  const counts = Object.fromEntries(Object.entries(corpus).map(([name, values]) => [name, values.length]));
  // The current design adds three bilingual corroborations; frozen revision 0
  // retains its original 75 propositions. Keep both inventories exact.
  const expectedPropositions = revision === CASE_DESIGN_REVISION ? 156 : 150;
  if (counts.testimony_response !== 288 || counts.hidden_result !== 16 || counts.wrong_outcome !== 32
    || counts.expert_observation !== 48 || counts.investigation_result !== 128 || counts.confirmed_proposition !== expectedPropositions
    || (revision === CASE_DESIGN_REVISION && (counts.failure_explanation !== 16 || counts.conditional_story_focus !== 32
      || counts.story_milestone !== 112 || counts.story_sequence !== 112 || counts.story_aftermath !== 40))) {
    throw new Error(`Private corpus revision ${revision} is incomplete or changed; review audit coverage.`);
  }
  for (const name of categoryNames) categories[name].push(...corpus[name]);
  coverage.push({ case_design_revision: revision, cases, counts });
}
const authoredCoverage = { report_evidence_scopes: 0, report_evidence_scope_phrases: 0, interview_exchanges: 0,
  conditional_interview_prompts: 0, public_initial_interview_prompts_excluded: 0 };
for (const caseId of INVESTIGATION_CASE_IDS) {
  const spec = getInvestigationContent(caseId, CASE_DESIGN_REVISION);
  const clueIds = spec.targets.map(target => target.clue_id);
  const run = { case_id: caseId, investigation_version: 2,
    investigation: { report_explanation_revision: REPORT_EXPLANATION_REVISION, case_design_revision: CASE_DESIGN_REVISION },
    state: { unlocked_clues: clueIds } };
  authoredCoverage.report_evidence_scopes += clueIds.length;
  for (const lang of ['zh', 'en']) {
    const roles = publicReportEvidenceRoles(run, spec, lang);
    if (roles.length !== 8 || !clueIds.every(id => roles.some(item => item.clue_id === id))) {
      throw new Error(`Report evidence-scope coverage is incomplete for ${caseId}.`);
    }
    for (const entry of roles) {
      const explanation = entry.roles[0]?.explanation;
      if (typeof explanation !== 'string' || !explanation.trim()) throw new Error(`Missing report evidence scope for ${entry.clue_id}.`);
      categories.report_evidence_scope.push(explanation);
      authoredCoverage.report_evidence_scope_phrases += 1;
    }
  }
  if (Object.keys(spec.testimonies).length !== 3) throw new Error(`Interview NPC coverage changed for ${caseId}.`);
  for (const npcId of Object.keys(spec.testimonies)) {
    for (const stage of [0, 1]) {
      const interview = getInterviewStrategyContent(caseId, npcId, stage);
      if (!interview) throw new Error(`Missing interview exchange for ${caseId}/${npcId}/${stage}.`);
      addBilingual(categories, 'interview_background', interview.background);
      addBilingual(categories, 'interview_claim', interview.claim);
      authoredCoverage.interview_exchanges += 1;
      // First-stage prompts are available on arrival. Later prompts depend on
      // an earned testimony stage and must not be compiled into the browser.
      if (stage === 1) {
        addBilingual(categories, 'conditional_interview_prompt', interview.prompt);
        authoredCoverage.conditional_interview_prompts += 1;
      } else {
        if (!interview.prompt?.zh || !interview.prompt?.en) throw new Error('Public interview prompt lacks bilingual text.');
        authoredCoverage.public_initial_interview_prompts_excluded += 1;
      }
    }
  }
}
if (authoredCoverage.report_evidence_scopes !== 64 || authoredCoverage.report_evidence_scope_phrases !== 128 || authoredCoverage.interview_exchanges !== 48
  || authoredCoverage.conditional_interview_prompts !== 24 || authoredCoverage.public_initial_interview_prompts_excluded !== 24) {
  throw new Error('Authored report/interview privacy corpus is incomplete or changed; review coverage.');
}
for (const caseData of ALL_CASES) {
  for (const langData of [caseData, caseData.en]) {
    for (const clue of langData?.clue_dictionary || []) {
      if (typeof clue.description === 'string' && clue.description.trim()) categories.legacy_clue_description.push(clue.description);
    }
    for (const conflict of langData?.conflict_dictionary || []) {
      if (typeof conflict.reason === 'string' && conflict.reason.trim()) categories.legacy_conflict_reason.push(conflict.reason);
    }
  }
}
if (categories.legacy_clue_description.length !== 144 || categories.legacy_conflict_reason.length !== 8) {
  throw new Error('Private corpus is incomplete or changed; update the audit coverage before accepting a build.');
}
// Frozen and current designs deliberately share many facts. Check each unique
// phrase once, retaining pre-dedup revision counts as completeness evidence.
for (const name of categoryNames) categories[name] = [...new Set(categories[name])];
const secretStrings = new Set(Object.values(categories).flat());

const assetFiles = await filesIn(buildRoot, /\.[cm]?js$/);
if (!assetFiles.length) throw new Error('No production browser JavaScript found. Run npm run build first.');
const files = [];
const matchedByCategory = Object.fromEntries(Object.keys(categories).map(key => [key, 0]));
let matched = 0;
let literalCount = 0;
for (const filename of assetFiles) {
  const buffer = await readFile(filename);
  const strings = builtStrings(buffer.toString('utf8'));
  const hits = new Set();
  for (const value of strings) {
    // Includes catches literal prefix/suffix folding as well as an exact quoted
    // value. Values are scanner-decoded, so escaped Unicode is audited too.
    for (const phrase of secretStrings) if (value.includes(phrase)) hits.add(phrase);
  }
  for (const [category, phrases] of Object.entries(categories)) {
    matchedByCategory[category] += new Set(phrases.filter(phrase => hits.has(phrase))).size;
  }
  matched += hits.size;
  literalCount += strings.length;
  files.push({ path: relative(filename), bytes: buffer.length, sha256: sha256(buffer),
    decoded_literals: strings.length, matched: hits.size });
}

const sources = await filesIn(sourceRoot, /\.[cm]?[jt]sx?$/);
const sourceImportViolations = [];
for (const filename of sources) {
  const imports = sourceImports(await readFile(filename, 'utf8'), filename);
  for (const specifier of imports) {
    const resolved = specifier.startsWith('@/') ? path.resolve(sourceRoot, specifier.slice(2))
      : specifier.startsWith('.') ? path.resolve(path.dirname(filename), specifier) : null;
    const serverRoot = path.join(root, 'server') + path.sep;
    if ((resolved && resolved.startsWith(serverRoot)) || /(?:^|\/)server\/investigationV2(?:\/|$)/.test(specifier)) {
      sourceImportViolations.push({ path: relative(filename), kind: 'server_module_import' });
    }
  }
}

const contentBytes = await readFile(path.join(root, 'server/investigationV2/content.js'));
const provenancePaths = ['scripts/check-investigation-public-build.mjs', 'scripts/browser-case-projection.mjs',
  'server/investigationV2/rawMaterials.js', 'server/investigationV2/caseDesign.js',
  'server/investigationV2/reportExplanation.js', 'server/investigationV2/interviewContent.js',
  'src/game/caseData.js', 'src/game/caseDataExtra.js', 'src/game/caseDataExpansion.js'];
const sourceHashes = Object.fromEntries(await Promise.all(provenancePaths.map(async filename =>
  [filename, sha256(await readFile(path.join(root, filename)))])));
const report = {
  schema_version: 2,
  check: 'v2_private_phrases_absent_from_browser_build',
  command: 'node scripts/check-investigation-public-build.mjs',
  content_sha256: sha256(contentBytes),
  corpus_sha256: sha256(JSON.stringify(categories)),
  source_sha256: sourceHashes,
  content_revisions_checked: contentRevisions,
  revision_coverage: coverage,
  authored_coverage: authoredCoverage,
  counts: Object.fromEntries(Object.entries(categories).map(([key, values]) => [key, values.length])),
  private_strings_checked: secretStrings.size,
  browser_js_files: files.length,
  decoded_literals: literalCount,
  matched,
  matched_by_category: matchedByCategory,
  source_files_checked: sources.length,
  source_import_violations: sourceImportViolations,
  files,
  result: matched === 0 && !sourceImportViolations.length ? 'passed' : 'failed',
  limitations: 'Frozen and current case-design revisions are both checked for private v2 testimony, hidden results, consequences, expert observations, investigation results and propositions. Current wrong-method explanations, conditional focus after opening, authored milestone/sequence/aftermath titles and bodies, 64 bilingual evidence scopes, and all 48 interview background/claim exchanges with their conditional later-stage prompts are included. Opening focus and initial interview prompts are intentionally public and excluded. Canonical legacy clue descriptions and correct-conflict reasons are included without exemptions. Revision and authored coverage counts precede deduplication; corpus counts are unique per category. Decoded literal containment and source import boundaries are checked. Short clue labels and weights, live API projections, arbitrary derived paraphrases and production deployment require separate authority tests.',
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, private_strings_checked: secretStrings.size,
  browser_js_files: files.length, decoded_literals: literalCount, matched, matched_by_category: matchedByCategory,
  source_import_violations: sourceImportViolations.length, output: relative(output) }));
if (report.result !== 'passed') process.exitCode = 1;
