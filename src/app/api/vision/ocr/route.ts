import { NextRequest, NextResponse } from 'next/server'
import { generateWithImage } from '@/lib/ollama'
import { OcrRequest, OcrResponse } from '@/types/vision'

const OCR_PROMPT = `この画像内に写っている文字だけを抽出してください。

ルール:
- 文字がない場合は空文字を返してください
- 説明文は不要です
- 推測しすぎないでください
- 読み取れる文字のみ返してください`

export async function POST(req: NextRequest) {
  let body: OcrRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です。' }, { status: 400 })
  }

  if (!body.imageBase64) {
    return NextResponse.json({ error: 'imageBase64は必須です。' }, { status: 400 })
  }

  try {
    const raw = await generateWithImage(OCR_PROMPT, body.imageBase64)
    return NextResponse.json({ text: raw.trim() } satisfies OcrResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : '画像認識に失敗しました。'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
