export type StampRequest = {
  machineId: string;
  workDescription: string;
  lat: number;
  lon: number;
  accuracy?: number;
  positionTimestamp?: number;
  distanceToSite?: number;
  decisionThreshold?: number;
  clientDecision?: 'auto' | 'blocked';
  siteId?: string;
  type: 'IN' | 'OUT';
};

export function validateStampRequest(
  data: unknown,
): { success: true; data: StampRequest } | { success: false; hint: string } {
  const body = data as Partial<StampRequest>;
  if (
    typeof body.machineId !== 'string' ||
    typeof body.workDescription !== 'string' ||
    typeof body.lat !== 'number' ||
    typeof body.lon !== 'number' ||
    (body.accuracy !== undefined && typeof body.accuracy !== 'number') ||
    (body.positionTimestamp !== undefined && typeof body.positionTimestamp !== 'number') ||
    (body.distanceToSite !== undefined && typeof body.distanceToSite !== 'number') ||
    (body.decisionThreshold !== undefined && typeof body.decisionThreshold !== 'number') ||
    (body.clientDecision !== undefined &&
      body.clientDecision !== 'auto' &&
      body.clientDecision !== 'blocked') ||
    (body.siteId !== undefined && typeof body.siteId !== 'string') ||
    (body.type !== 'IN' && body.type !== 'OUT')
  ) {
    return {
      success: false,
      hint: 'machineId, workDescription, lat, lon, type are required',
    };
  }
  return { success: true, data: body as StampRequest };
}
