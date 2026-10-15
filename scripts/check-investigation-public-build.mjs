#!/usr/bin/env node
// Run only in the repository: this Node-only audit imports private server content
// to compare it with emitted browser strings. Do not import this script from src.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
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

const categories = { testimony_response: [], hidden_result: [], wrong_outcome: [], expert_observation: [],
  investigation_result: [], confirmed_proposition: [], legacy_clue_description: [], legacy_conflict_reason: [] };
for (const caseId of INVESTIGATION_CASE_IDS) {
  const content = getInvestigationContent(caseId);
  for (const stages of Object.values(content.testimonies)) {
    for (const stage of stages) {
      for (const field of ['response', 'gentle_response', 'firm_response']) {
        for (const lang of ['zh', 'en']) categories.testimony_response.push(stage[field][lang]);
      }
    }
  }
  for (const lang of ['zh', 'en']) categories.hidden_result.push(content.hidden.result[lang]);
  for (const outcome of Object.values(content.report.wrong_outcomes)) {
    for (const lang of ['zh', 'en']) categories.wrong_outcome.push(outcome[lang]);
  }
  for (const target of content.targets.filter(item => !item.hidden)) {
    for (const lang of ['zh', 'en']) categories.investigation_result.push(target.result[lang]);
  }
  for (const proposition of content.relations) {
    for (const lang of ['zh', 'en']) categories.confirmed_proposition.push(proposition.label[lang]);
  }
  for (const target of [...content.targets, content.hidden]) {
    if (!target.expert_note) continue;
    for (const lang of ['zh', 'en']) {
      const phrase = target.expert_note.text?.[lang];
      if (typeof phrase !== 'string' || !phrase.trim()) throw new Error('A private expert observation lacks bilingual text.');
      categories.expert_observation.push(phrase);
    }
  }
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
const secretStrings = new Set(Object.values(categories).flat());
if (categories.testimony_response.length !== 288 || categories.hidden_result.length !== 16
  || categories.wrong_outcome.length !== 32 || categories.expert_observation.length !== 48 || categories.legacy_clue_description.length !== 144
  || categories.investigation_result.length !== 128 || categories.confirmed_proposition.length < 96
  || categories.legacy_conflict_reason.length !== 8) {
  throw new Error('Private corpus is incomplete or changed; update the audit coverage before accepting a build.');
}

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
  'src/game/caseData.js', 'src/game/caseDataExtra.js', 'src/game/caseDataExpansion.js'];
const sourceHashes = Object.fromEntries(await Promise.all(provenancePaths.map(async filename =>
  [filename, sha256(await readFile(path.join(root, filename)))])));
const report = {
  schema_version: 1,
  check: 'v2_private_phrases_absent_from_browser_build',
  command: 'node scripts/check-investigation-public-build.mjs',
  content_sha256: sha256(contentBytes),
  corpus_sha256: sha256(JSON.stringify(categories)),
  source_sha256: sourceHashes,
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
  limitations: 'All private v2 responses, hidden results, consequences and present expert observations plus canonical legacy clue descriptions and correct-conflict reasons are checked as decoded literal containment. No legacy description is exempted, including generic hidden metadata. Short clue labels and weights are validated separately by browser projection and authority tests. Source import boundaries are also checked. This does not audit live API projections, arbitrary derived paraphrases or production deployment; those require separate authority tests.',
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, private_strings_checked: secretStrings.size,
  browser_js_files: files.length, decoded_literals: literalCount, matched, matched_by_category: matchedByCategory,
  source_import_violations: sourceImportViolations.length, output: relative(output) }));
if (report.result !== 'passed') process.exitCode = 1;
