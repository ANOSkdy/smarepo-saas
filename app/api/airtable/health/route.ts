import { NextResponse } from 'next/server';
import { airtableHealth } from '@/lib/airtable';

export const runtime = 'nodejs';

export async function GET() {
  const health = await airtableHealth();
  if (!health.ok) {
    return NextResponse.json(
      { ok: false, reason: health.reason ?? 'failed' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
