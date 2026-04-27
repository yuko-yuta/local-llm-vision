import { NextRequest, NextResponse } from 'next/server'
import { generateWithImage } from '@/lib/ollama'
import { AnalyzeRequest, AnalyzeResponse } from '@/types/vision'

const ANALYZE_PROMPT = `この画像を日本語で分析してください。

以下の形式で回答してください。

【画像の概要】
画像全体に何が写っているか

【認識した物体】
箇条書きで記載

【認識した文字】
画像内に文字がある場合のみ記載

【補足】
気づいた点があれば記載`

export async function POST(req: NextRequest) {
  let body: AnalyzeRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です。' }, { status: 400 })
  }

  if (!body.imageBase64) {
    return NextResponse.json({ error: 'imageBase64は必須です。' }, { status: 400 })
  }

  try {
    const result = await generateWithImage(ANALYZE_PROMPT, body.imageBase64)
    return NextResponse.json({ result } satisfies AnalyzeResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : '画像認識に失敗しました。'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
