import { NextRequest, NextResponse } from 'next/server'
import { generateWithImage } from '@/lib/ollama'
import { CardRequest, CardResponse, BusinessCardData } from '@/types/vision'

const CARD_PROMPT = `この画像は名刺です。以下のJSON形式で情報を抽出してください。
読み取れない項目は空文字にしてください。
説明文・コードブロック・余分な文字は不要です。JSONのみ返してください。

抽出ルール:
- "department" は「○○部」「○○課」「○○本部」「○○室」など組織の所属を表す表記を抽出する
- "title" は「課長」「マネージャー」「Director」など役職を表す表記を抽出する
- "companyUrl" は会社のWebサイトURL（http(s)://～）を抽出する。@ で始まるメールアドレスは含めない
- "tel" は会社固定電話（TEL）を抽出する
- "mobile" は携帯電話（Mobile・携帯・Cell）を抽出する
- "fax" は FAX 番号を抽出する

住所の抽出ルール:
- 郵便番号・都道府県・市区町村・番地・号をすべて含めること
- ビル名・建物名・タワー名が記載されている場合は必ず含めること
- 階数（○F・○階）が記載されている場合は必ず含めること
- 部屋番号・号室が記載されている場合は必ず含めること
- 住所に関する情報は一切省略せず、名刺に記載された文字をそのまま抽出すること

{
  "name": "氏名（漢字）",
  "nameAlphabet": "氏名（アルファベット）",
  "nameKana": "氏名（ふりがな・カタカナ）",
  "company": "会社名",
  "department": "部署名",
  "title": "役職・肩書",
  "companyUrl": "会社のWebサイトURL",
  "address": "郵便番号から始まる完全な住所（ビル名・階数・部屋番号を含む）",
  "email": "メールアドレス",
  "tel": "会社の電話番号（TEL）",
  "fax": "会社のFAX番号（FAX）",
  "mobile": "携帯電話番号（Mobile・携帯）"
}`

const EMPTY_CARD: BusinessCardData = {
  name: '',
  nameAlphabet: '',
  nameKana: '',
  company: '',
  department: '',
  title: '',
  companyUrl: '',
  address: '',
  email: '',
  tel: '',
  fax: '',
  mobile: '',
}

function parseCardJson(raw: string): BusinessCardData {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return { ...EMPTY_CARD }

  const parsed = JSON.parse(match[0]) as Record<string, unknown>

  return {
    name:         String(parsed.name         ?? ''),
    nameAlphabet: String(parsed.nameAlphabet ?? ''),
    nameKana:     String(parsed.nameKana     ?? ''),
    company:      String(parsed.company      ?? ''),
    department:   String(parsed.department   ?? ''),
    title:        String(parsed.title        ?? ''),
    companyUrl:   String(parsed.companyUrl   ?? ''),
    address:      String(parsed.address      ?? ''),
    email:        String(parsed.email        ?? ''),
    tel:          String(parsed.tel          ?? ''),
    fax:          String(parsed.fax          ?? ''),
    mobile:       String(parsed.mobile       ?? ''),
  }
}

export async function POST(req: NextRequest) {
  let body: CardRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です。' }, { status: 400 })
  }

  if (!body.imageBase64) {
    return NextResponse.json({ error: 'imageBase64は必須です。' }, { status: 400 })
  }

  try {
    const raw = await generateWithImage(CARD_PROMPT, body.imageBase64)
    const card = parseCardJson(raw)
    return NextResponse.json({ card } satisfies CardResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : '名刺の読み取りに失敗しました。'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
