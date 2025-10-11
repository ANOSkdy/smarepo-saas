import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

type BackfillRange = {
  from: string;
  to: string;
};

function parseRange(request: NextRequest): BackfillRange {
  const searchParams = request.nextUrl.searchParams;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const from = searchParams.get('from') ?? firstDay.toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? lastDay.toISOString().slice(0, 10);
  return { from, to };
}

export async function POST(request: NextRequest): Promise<Response> {
  parseRange(request);
  return Response.json({ ok: true, processed: 0, note: 'P0 placeholder' });
}
