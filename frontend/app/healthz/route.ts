import { NextResponse } from 'next/server';
import { loadLegalConfig } from '../../config/legal-config';

export async function GET() {
  try {
    await loadLegalConfig();
    return NextResponse.json({
      status: 'ok',
      service: 'frontend',
    });
  } catch {
    return NextResponse.json(
      { status: 'error', service: 'frontend' },
      { status: 503 },
    );
  }
}
