import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildDayDetail, getLogsBetween, type NormalizedLog } from '@/lib/airtable/logs';

type MachineLogExtras = {
  machine?: string | number | readonly string[] | null;
  machineId?: string | number | readonly string[] | null;
  machineid?: string | number | readonly string[] | null;
  fields?: Record<string, unknown> | null;
};

type MachinesListResponse = {
  records?: Array<{
    id: string;
    fields?: {
      machineId?: string | number | null;
      machineid?: string | number | null;
    } | null;
  }>;
};

const chunk = <T,>(items: readonly T[], size: number) => {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const buildFilterFormula = (ids: readonly string[]) =>
  `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`;

function normalizeMachineId(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const value = String(raw).trim();
  return value.length === 0 ? undefined : value;
}

function extractMachineLinkId(raw: unknown): string | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const first = raw[0];
  return typeof first === 'string' ? first : undefined;
}

function resolveMachineValue(
  raw: unknown,
  linkMap: ReadonlyMap<string, string>,
): string | undefined {
  const linked = extractMachineLinkId(raw);
  if (linked) {
    return linkMap.get(linked);
  }
  if (Array.isArray(raw)) {
    return undefined;
  }
  return normalizeMachineId(raw);
}

function extractMachineId(log: NormalizedLog, linkMap: ReadonlyMap<string, string>): string | undefined {
  const extras = log as NormalizedLog & MachineLogExtras;
  const direct =
    resolveMachineValue(extras.machine, linkMap) ??
    resolveMachineValue(extras.machineId, linkMap) ??
    resolveMachineValue(extras.machineid, linkMap);
  if (direct) {
    return direct;
  }
  const { fields } = extras;
  if (!fields || typeof fields !== 'object') {
    return undefined;
  }
  const record = fields as Record<string, unknown>;
  return (
    resolveMachineValue(record.machine, linkMap) ??
    resolveMachineValue(record.machineId, linkMap) ??
    resolveMachineValue(record.machineid, linkMap)
  );
}

function collectMachineAssignments(
  logs: NormalizedLog[],
  linkMap: ReadonlyMap<string, string>,
): (string | undefined)[] {
  type OpenSessionState = { log: NormalizedLog; machineId?: string } | null;
  const sorted = [...logs].sort((a, b) => a.timestampMs - b.timestampMs);
  const openSessions = new Map<string, OpenSessionState>();
  const machineQueue: (string | undefined)[] = [];

  for (const log of sorted) {
    const userKey = log.userId ?? log.userName ?? 'unknown-user';
    const currentOpen = openSessions.get(userKey) ?? null;

    if (log.type === 'IN') {
      if (currentOpen) {
        machineQueue.push(currentOpen.machineId);
      }
      openSessions.set(userKey, { log, machineId: extractMachineId(log, linkMap) });
      continue;
    }

    if (!currentOpen) {
      continue;
    }

    if (log.timestampMs <= currentOpen.log.timestampMs) {
      continue;
    }

    machineQueue.push(currentOpen.machineId);
    openSessions.set(userKey, null);
  }

  for (const [, pending] of openSessions) {
    if (pending) {
      machineQueue.push(pending.machineId);
    }
  }

  return machineQueue;
}

export const runtime = 'nodejs';

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

async function resolveMachineLinkMap(ids: readonly string[]): Promise<Map<string, string>> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId || ids.length === 0) {
    return new Map();
  }

  const resolved = new Map<string, string>();
  for (const batch of chunk(ids, 15)) {
    if (batch.length === 0) {
      continue;
    }
    const params = new URLSearchParams();
    params.set('filterByFormula', buildFilterFormula(batch));
    params.append('fields[]', 'machineId');
    params.append('fields[]', 'machineid');
    const url = `https://api.airtable.com/v0/${baseId}/Machines?${params.toString()}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        console.error('[calendar][day] failed to list machines', response.status, await response.text());
        continue;
      }
      const payload = (await response.json()) as MachinesListResponse;
      for (const record of payload.records ?? []) {
        const value = normalizeMachineId(record.fields?.machineId ?? record.fields?.machineid);
        if (value) {
          resolved.set(record.id, value);
        }
      }
    } catch (error) {
      console.error('[calendar][day] machine lookup failed', error);
    }
  }
  return resolved;
}

function collectMachineLinkIds(logs: NormalizedLog[]): string[] {
  const identifiers = new Set<string>();
  for (const log of logs) {
    if (log.type !== 'IN') {
      continue;
    }
    const extras = log as NormalizedLog & MachineLogExtras;
    const { fields } = extras;
    const candidates = [extras.machine, extras.machineId, extras.machineid];
    if (fields && typeof fields === 'object') {
      const record = fields as Record<string, unknown>;
      const fromMachine = record.machine as MachineLogExtras['machine'];
      const fromMachineId = record.machineId as MachineLogExtras['machineId'];
      const fromMachineid = record.machineid as MachineLogExtras['machineid'];
      candidates.push(fromMachine, fromMachineId, fromMachineid);
    }
    for (const candidate of candidates) {
      const linkId = extractMachineLinkId(candidate);
      if (linkId) {
        identifiers.add(linkId);
      }
    }
  }
  return Array.from(identifiers);
}

function resolveDayRange(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const from = new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
  const to = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0));
  return { from, to };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 401);
  }

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    if (!date) {
      return errorResponse('MISSING_DATE', 400);
    }

    const range = resolveDayRange(date);
    if (!range) {
      return errorResponse('INVALID_DATE', 400);
    }

    const logs = await getLogsBetween(range);
    const machineLinkIds = collectMachineLinkIds(logs);
    const machineLinkMap = await resolveMachineLinkMap(machineLinkIds);
    const machineAssignments = collectMachineAssignments(logs, machineLinkMap);
    const { sessions } = buildDayDetail(logs);
    const sessionsWithMachine = sessions.map((session, index) => ({
      ...session,
      machineId: machineAssignments[index],
    }));
    return NextResponse.json({ date, sessions: sessionsWithMachine });
  } catch (error) {
    console.error('[calendar][day] failed to fetch day detail', error);
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
