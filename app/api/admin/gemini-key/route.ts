import { NextResponse } from 'next/server';
import { saveGeminiApiKey } from '@/src/lib/adminConfig';
import { isCurrentUserAdmin } from '@/src/lib/adminAccess';

export async function POST(request: Request) {
  try {
    const allowed = await isCurrentUserAdmin();
    if (!allowed) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const payload = await request.json();
    const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
    const tokenLimitValue = payload?.tokenLimit;

    if (!apiKey) {
      return NextResponse.json({ error: 'A Gemini API key is required.' }, { status: 400 });
    }

    const result = await saveGeminiApiKey(apiKey, tokenLimitValue);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
