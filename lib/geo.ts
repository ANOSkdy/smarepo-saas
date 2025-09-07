import { SiteFields } from '@/types';
import { Record } from 'airtable';

// 2点間の距離を計算するハバーサイン公式
const haversineDistance = (
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

// 現場リストの中から最も近い現場を見つける関数
export const findNearestSite = (
  lat: number,
  lon: number,
  sites: readonly Record<SiteFields>[]
): Record<SiteFields> | null => {
  if (sites.length === 0) {
    return null;
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

  return nearestSite;
};