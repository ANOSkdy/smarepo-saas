#!/usr/bin/env -S node --loader tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
const APP_SEGMENT_OMIT = /^\(.*\)$/;
const ENV_REGEX = /process\.env\.(\w+)/g;
const ENV_BRACKET_REGEX = /process\.env\[['"]([A-Z0-9_]+)['"]\]/gi;

async function readJson(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if ((error)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function listTopLevelDirectories(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name }));
}

async function walk(root, ignoreDirs = new Set()) {
  const results = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) {
          continue;
        }
        await visit(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  await visit(root);
  return results;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function toAppRoute(relativePath) {
  const segments = relativePath.split('/');
  if (segments[0] !== 'app') {
    return null;
  }
  const useful = segments.slice(1, -1).filter((segment) => !APP_SEGMENT_OMIT.test(segment));
  const routePath = useful.length === 0 ? '/' : `/${useful.join('/')}`;
  return routePath.replace(/\/page$/, '');
}

function detectHttpMethods(content) {
  const methods = new Set();
  for (const method of HTTP_METHODS) {
    const regex = new RegExp(`export\\s+async\\s+function\\s+${method}|export\\s+function\\s+${method}`, 'g');
    if (regex.test(content)) {
      methods.add(method);
    }
  }
  return Array.from(methods).sort();
}

function detectRuntime(content) {
  const match = content.match(/export\s+const\s+runtime\s*=\s*['"]([^'\"]+)['"]/);
  return match ? match[1] : null;
}

function collectEnvUsage(filePath, content, map) {
  let match;
  while ((match = ENV_REGEX.exec(content))) {
    const key = match[1];
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    map.get(key).add(toPosixPath(filePath));
  }
  while ((match = ENV_BRACKET_REGEX.exec(content))) {
    const key = match[1];
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    map.get(key).add(toPosixPath(filePath));
  }
}

function parseCredentialsProvider(content) {
  const hasCredentials = /Credentials\(/.test(content);
  const passwordComparison = /password\s*===\s*userRecord\.fields\.password/.test(content);
  const sessionStrategyMatch = content.match(/session:\s*{[^}]*strategy:\s*'([^']+)'/);
  const callbacks = {
    jwt: /callbacks:\s*{[\s\S]*jwt\s*\(/.test(content),
    session: /callbacks:\s*{[\s\S]*session\s*\(/.test(content),
  };
  return {
    hasCredentials,
    passwordComparison,
    sessionStrategy: sessionStrategyMatch ? sessionStrategyMatch[1] : null,
    callbacks,
  };
}

function parseAirtableTables(content) {
  const tableRegex = /getTypedTable<[^>]+>\(['"]([^'\"]+)['"]\)/g;
  const tables = new Set();
  let match;
  while ((match = tableRegex.exec(content))) {
    tables.add(match[1]);
  }
  const constTableRegex = /const\s+([A-Z_]+)_TABLE\s*=\s*process\.env\.([A-Z0-9_]+)\s*\|\|\s*['"]([^'\"]+)['"]/g;
  while ((match = constTableRegex.exec(content))) {
    tables.add(match[3]);
  }
  return Array.from(tables);
}

async function main() {
  const root = process.cwd();
  const topLevelDirs = await listTopLevelDirectories(root);
  const ignoreDirs = new Set(['node_modules', '.git', '.next', '.vercel', 'reports', 'docs', 'tests/dist']);
  const allFiles = await walk(root, ignoreDirs);
  const routeFiles = allFiles.filter((file) =>
    file.includes(`${path.sep}app${path.sep}`) && /\/(page|route)\.(ts|tsx|js|jsx)$/.test(toPosixPath(file))
  );

  const routes = [];
  for (const file of routeFiles) {
    const content = await fs.readFile(file, 'utf8');
    const relative = toPosixPath(path.relative(root, file));
    const routePath = toAppRoute(relative);
    const type = relative.endsWith('page.tsx')
      ? 'page'
      : relative.endsWith('route.ts')
      ? 'route'
      : 'other';
    const methods = type === 'route' ? detectHttpMethods(content) : [];
    const runtime = detectRuntime(content);
    routes.push({ file: relative, path: routePath, type, methods, runtime });
  }

  const envUsage = new Map();
  for (const file of allFiles) {
    if (!/(\.(ts|tsx|js|jsx|mjs|cjs))$/.test(file)) {
      continue;
    }
    const content = await fs.readFile(file, 'utf8');
    collectEnvUsage(file, content, envUsage);
  }

  const env = Array.from(envUsage.entries())
    .map(([key, files]) => ({ key, files: Array.from(files).sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const packageJson = await readJson(path.join(root, 'package.json'));
  const nextConfig = await readText(path.join(root, 'next.config.ts'));
  const vercelConfig = await readJson(path.join(root, 'vercel.json'));
  const eslintConfig = await readText(path.join(root, 'eslint.config.mjs'));
  const tsconfig = await readJson(path.join(root, 'tsconfig.json'));

  const middlewareSource = await readText(path.join(root, 'middleware.ts'));
  let middleware = null;
  if (middlewareSource) {
    const matcherMatch = middlewareSource.match(/matcher:\s*\[(.*?)\]/s);
    const matcher = matcherMatch
      ? matcherMatch[1]
          .split(',')
          .map((entry) => entry.replace(/["'`]/g, '').trim())
          .filter((entry) => entry.length > 0 && !entry.startsWith('/*'))
      : [];
    middleware = {
      hasAuthMiddleware: /auth as middleware/.test(middlewareSource),
      matcher,
    };
  }

  const authSource = await readText(path.join(root, 'lib', 'auth.ts'));
  let authSummary = null;
  if (authSource) {
    const details = parseCredentialsProvider(authSource);
    const secretWarning = /console\.error\('NEXTAUTH_SECRET is not set'\)/.test(authSource);
    authSummary = {
      ...details,
      logsSecretWarning: secretWarning,
    };
  }

  const airtableDir = path.join(root, 'lib', 'airtable');
  let airtableFiles = [];
  try {
    const entries = await fs.readdir(airtableDir);
    airtableFiles = entries
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => path.join('lib', 'airtable', entry));
  } catch {
    airtableFiles = [];
  }

  const airtable = [];
  for (const relative of airtableFiles) {
    const absolute = path.join(root, relative);
    const content = await readText(absolute);
    if (!content) continue;
    airtable.push({
      file: toPosixPath(relative),
      tables: parseAirtableTables(content),
    });
  }

  const result = {
    generatedAt: new Date().toISOString(),
    root,
    topLevelDirs,
    packageJson,
    nextConfig,
    vercelConfig,
    eslintConfig,
    tsconfig,
    routes,
    env,
    middleware,
    auth: authSummary,
    airtable,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error('scan failed', error);
  process.exitCode = 1;
});
