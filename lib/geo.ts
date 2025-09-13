import { SiteFields } from '@/types';
import { Record } from 'airtable';

type Polygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

type MultiPolygon = {
  type: 'MultiPolygon';
  coordinates: number[][][][];
};

export type Geometry = Polygon | MultiPolygon;
export type DecisionMethod = 'gps_polygon' | 'gps_nearest';
export type NearestResult = {
  site: Record<SiteFields> | null;
  method: DecisionMethod;
  nearestDistanceM: number | null;
};

// 2点間の距離を計算するハバーサイン公式
export const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const R = 6371e3; // 地球の半径 (メートル)
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // 距離 (メートル)
};

type Feature = { type: 'Feature'; geometry?: Geometry };
type FeatureCollection = { type: 'FeatureCollection'; features?: Feature[] };
type Raw = Geometry | Feature | FeatureCollection;

export const extractGeometry = (raw: string | null): Geometry | null => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Raw;
    const geom =
      parsed.type === 'FeatureCollection'
        ? parsed.features?.[0]?.geometry
        : parsed.type === 'Feature'
          ? parsed.geometry
          : parsed;
    if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
      return geom;
    }
    return null;
  } catch (e) {
    console.warn('[geo] polygon parse failed', { raw: trimmed, error: e });
    return null;
  }
};

const pointInRing = (
  lat: number,
  lon: number,
  ring: readonly number[][]
): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lonI, latI] = ring[i];
    const [lonJ, latJ] = ring[j];
    const intersect =
      latI > lat !== latJ > lat &&
      lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI;
    if (intersect) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (
  lat: number,
  lon: number,
  coords: readonly number[][][]
): boolean => {
  if (!pointInRing(lat, lon, coords[0])) return false;
  for (let i = 1; i < coords.length; i++) {
    if (pointInRing(lat, lon, coords[i])) return false;
  }
  return true;
};

export const pointInGeometry = (
  lat: number,
  lon: number,
  geometry: Geometry
): boolean => {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lat, lon, geometry.coordinates);
  }
  return geometry.coordinates.some((p) => pointInPolygon(lat, lon, p));
};

// 現場リストの中から最も近い現場を見つける関数
export const findNearestSiteDetailed = (
  lat: number,
  lon: number,
  sites: readonly Record<SiteFields>[]
): NearestResult => {
  if (sites.length === 0) {
    return { site: null, method: 'gps_nearest', nearestDistanceM: null };
  }

  for (const site of sites) {
    const geom = extractGeometry(site.fields.polygon_geojson ?? null);
    if (geom && pointInGeometry(lat, lon, geom)) {
      return { site, method: 'gps_polygon', nearestDistanceM: 0 };
    }
  }

  let nearestSite: Record<SiteFields> | null = null;
  let minDistance = Infinity;

  for (const site of sites) {
    const distance = haversineDistance(lat, lon, site.fields.lat, site.fields.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestSite = site;
    }
  }

  return {
    site: nearestSite,
    method: 'gps_nearest',
    nearestDistanceM: Number.isFinite(minDistance) ? minDistance : null,
  };
};

export const findNearestSite = (
  lat: number,
  lon: number,
  sites: readonly Record<SiteFields>[]
): Record<SiteFields> | null =>
  findNearestSiteDetailed(lat, lon, sites).site;
