#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..');

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

const KNOWN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveImport(source: string, importer: string): string | null {
  if (source.startsWith('@/')) {
    const relative = source.slice(2);
    return resolveWithExtensions(path.join(projectRoot, relative));
  }
  if (source.startsWith('./') || source.startsWith('../')) {
    const base = path.resolve(path.dirname(importer), source);
    return resolveWithExtensions(base);
  }
  return null; // external dependency
}

function resolveWithExtensions(candidate: string): string | null {
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  for (const ext of KNOWN_EXTENSIONS) {
    const withExt = candidate.endsWith(ext) ? candidate : candidate + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return withExt;
    }
  }
  for (const ext of KNOWN_EXTENSIONS) {
    const indexCandidate = path.join(candidate, 'index' + ext);
    if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
      return indexCandidate;
    }
  }
  return null;
}

type ModuleNode = {
  filePath: string;
  externalImports: string[];
  children: ModuleNode[];
};

const visited = new Set<string>();

function buildGraph(entry: string): ModuleNode {
  const absoluteEntry = resolveWithExtensions(path.isAbsolute(entry) ? entry : path.join(projectRoot, entry));
  if (!absoluteEntry) {
    throw new Error(`Unable to resolve entry: ${entry}`);
  }

  return walkModule(absoluteEntry);
}

function walkModule(filePath: string): ModuleNode {
  if (visited.has(filePath)) {
    return { filePath, externalImports: [], children: [] };
  }
  visited.add(filePath);

  const source = readFileSafe(filePath) ?? '';
  const importRegex = /import\s+(?:[^'";]+?from\s+)?['"]([^'";]+)['"];?|export\s+\*\s+from\s+['"]([^'";]+)['"]/g;
  const children: ModuleNode[] = [];
  const externalImports = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source))) {
    const specifier = match[1] ?? match[2];
    if (!specifier) {
      continue;
    }
    const resolved = resolveImport(specifier, filePath);
    if (resolved) {
      children.push(walkModule(resolved));
    } else {
      externalImports.add(specifier);
    }
  }

  return { filePath, externalImports: Array.from(externalImports).sort(), children };
}

function formatGraph(node: ModuleNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const relativePath = path.relative(projectRoot, node.filePath) || path.basename(node.filePath);
  const lines: string[] = [];
  lines.push(`${indent}- ${relativePath}`);
  if (node.externalImports.length > 0) {
    lines.push(`${indent}  externals: ${node.externalImports.join(', ')}`);
  }
  for (const child of node.children) {
    lines.push(formatGraph(child, depth + 1));
  }
  return lines.join('\n');
}

if (require.main === module) {
  const entry = process.argv[2] ?? 'app/reports/page.tsx';
  const graph = buildGraph(entry);
  console.log(formatGraph(graph));
}
