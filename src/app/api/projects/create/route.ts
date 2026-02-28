import { mkdir } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

interface CreatePayload {
  projectName?: string;
  targetPath?: string;
}

export async function POST(req: Request) {
  const payload = (await req.json()) as CreatePayload;
  const targetPath = String(payload.targetPath ?? '').trim();

  if (!targetPath) {
    return NextResponse.json({ ok: false, error: 'Укажи путь проекта.' }, { status: 400 });
  }

  const folderPath = path.normalize(targetPath);

  try {
    await mkdir(folderPath, { recursive: false });
    return NextResponse.json({ ok: true, folderPath, existed: false });
  } catch (error: unknown) {
    const maybe = error as NodeJS.ErrnoException;
    if (maybe?.code === 'EEXIST') {
      return NextResponse.json({ ok: true, folderPath, existed: true });
    }

    return NextResponse.json(
      { ok: false, error: maybe?.message || 'Не удалось создать папку.' },
      { status: 500 }
    );
  }
}
