import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const CATALOG_FILES = ['caseData.js', 'caseDataExtra.js', 'caseDataExpansion.js'];

function propertyName(property) {
  return property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ? property.name.text : null;
}

// Node and Wrangler read the unchanged catalog. Only Vite's browser graph gets
// this projection; discovered evidence copy comes from publicRun.revealed_clues.
export function projectCaseCatalogForBrowser(source, filename = 'caseData.js') {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length) throw new Error(`Cannot safely project ${filename}: invalid catalog syntax.`);
  const edits = [];
  function visit(node, english = false) {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node);
      if (name === 'conflict_dictionary') {
        edits.push({ start: node.initializer.getStart(parsed), end: node.initializer.end, replacement: '[]' });
        return;
      }
      if (name === 'clue_dictionary') {
        if (!ts.isArrayLiteralExpression(node.initializer)) {
          throw new Error(`Cannot safely project ${filename}: clue_dictionary must be a literal array.`);
        }
        for (const clue of node.initializer.elements) {
          if (!ts.isObjectLiteralExpression(clue) || clue.properties.some(property => !ts.isPropertyAssignment(property))) {
            throw new Error(`Cannot safely project ${filename}: clue entries must be literal objects.`);
          }
          for (const property of clue.properties) {
            const clueProperty = propertyName(property);
            const replacement = clueProperty === 'description' ? '""'
              : clueProperty === 'keyword' ? JSON.stringify(english ? 'Unverified evidence' : '待核验证据')
                : clueProperty === 'weight' ? '"MEDIUM"' : null;
            if (replacement !== null) {
              edits.push({ start: property.initializer.getStart(parsed), end: property.initializer.end, replacement });
            }
          }
        }
        return;
      }
      if (name === 'en') {
        ts.forEachChild(node, child => visit(child, true));
        return;
      }
    }
    ts.forEachChild(node, child => visit(child, english));
  }
  visit(parsed);
  let projected = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    projected = projected.slice(0, edit.start) + edit.replacement + projected.slice(edit.end);
  }
  return projected;
}

export function browserCaseProjection(projectRoot) {
  const catalogPaths = new Set(CATALOG_FILES.map(name => resolve(projectRoot, 'src/game', name).replaceAll('\\', '/')));
  function catalogPath(id, options) {
    const path = id.split('?')[0].replaceAll('\\', '/');
    return !options?.ssr && catalogPaths.has(path) ? path : null;
  }
  return {
    name: 'browser-case-projection',
    enforce: 'pre',
    async load(id, options) {
      const path = catalogPath(id, options);
      if (!path) return null;
      const query = new URLSearchParams(id.includes('?') ? id.slice(id.indexOf('?') + 1) : '');
      // Vite's ?raw loader would otherwise wrap the original file into a string
      // before transform hooks can visit its clue_dictionary properties.
      if (query.has('raw')) {
        const projected = projectCaseCatalogForBrowser(await readFile(path, 'utf8'), path);
        return `export default ${JSON.stringify(projected)};`;
      }
      if (query.has('url')) throw new Error('Browser case catalogs cannot be published as raw assets.');
      return null;
    },
    transform(source, id, options) {
      const path = catalogPath(id, options);
      if (!path) return null;
      const code = projectCaseCatalogForBrowser(source, path);
      return {
        code,
        // Even development source maps must carry projected content rather than
        // Vite's original source, which still contains undiscovered evidence.
        map: { version: 3, file: path, sources: [path], sourcesContent: [code], names: [], mappings: '' },
      };
    },
  };
}
