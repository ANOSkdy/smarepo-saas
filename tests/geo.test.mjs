import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
execSync(
  'pnpm exec tsc -p tsconfig.json --outDir tests/dist --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --noEmit false',
  { cwd: root, stdio: 'inherit' }
);

const { findNearestSiteDetailed, pointInGeometry } = await import('./dist/lib/geo.js');

test('findNearestSite prioritizes polygon containment', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
  };
  const siteWithPolygon = {
    fields: {
      siteId: '1',
      name: 'poly',
      lat: 100,
      lon: 100,
      client: 'c',
      polygon_geojson: JSON.stringify(polygon),
    },
  };
  const nearbySite = {
    fields: { siteId: '2', name: 'near', lat: 0.1, lon: 0.1, client: 'c' },
  };
  const result = findNearestSiteDetailed(0, 0, [nearbySite, siteWithPolygon]);
  assert.strictEqual(result.site, siteWithPolygon);
  assert.strictEqual(result.method, 'gps_polygon');
  assert.strictEqual(result.nearestDistanceM, 0);
});

test('findNearestSite falls back to nearest distance', () => {
  const siteA = {
    fields: { siteId: '1', name: 'A', lat: 0, lon: 0, client: 'c' },
  };
  const siteB = {
    fields: {
      siteId: '2',
      name: 'B',
      lat: 0,
      lon: 1,
      client: 'c',
      polygon_geojson: 'invalid',
    },
  };
  const result = findNearestSiteDetailed(0, 0, [siteA, siteB]);
  assert.strictEqual(result.site, siteA);
  assert.strictEqual(result.method, 'gps_nearest');
  assert(result.nearestDistanceM < 100);
});

test('pointInGeometry excludes holes', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
      [
        [0.5, 0.5],
        [0.5, 1.5],
        [1.5, 1.5],
        [1.5, 0.5],
        [0.5, 0.5],
      ],
    ],
  };
  assert.strictEqual(pointInGeometry(1, 1, polygon), false);
});
