export type StampRequest = {
  machineId: string;
  workDescription: string;
  lat: number;
  lon: number;
  accuracy?: number;
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
    (body.type !== 'IN' && body.type !== 'OUT')
  ) {
    return {
      success: false,
      hint: 'machineId, workDescription, lat, lon, type are required',
    };
  }
  return { success: true, data: body as StampRequest };
}
