import { OllamaChatRequest, OllamaChatResponse } from '@/types/vision'

const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'gemma4'

export async function generateWithImage(
  prompt: string,
  base64Image: string
): Promise<string> {
  const pureBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '')

  const body: OllamaChatRequest = {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: prompt,
        images: [pureBase64],
      },
    ],
    stream: false,
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const cause = (err as { cause?: { code?: string; message?: string } }).cause
    const causeCode = cause?.code ?? ''
    const causeMsg = cause?.message ?? ''
    const isConnRefused =
      message.includes('ECONNREFUSED') ||
      message.includes('fetch failed') ||
      message.includes('Failed to fetch') ||
      causeCode === 'ECONNREFUSED' ||
      causeMsg.includes('ECONNREFUSED')
    if (isConnRefused) {
      throw new Error('Ollamaが起動していません。ollama serve を確認してください。')
    }
    console.error('[ollama] generateWithImage error:', err)
    throw new Error(`画像認識に失敗しました。${message}`)
  }

  if (response.status === 404) {
    throw new Error('gemma4モデルが見つかりません。ollama pull gemma4 を実行してください。')
  }

  if (!response.ok) {
    throw new Error(`画像認識に失敗しました。(HTTP ${response.status})`)
  }

  const data = (await response.json()) as OllamaChatResponse
  return data.message.content
}
