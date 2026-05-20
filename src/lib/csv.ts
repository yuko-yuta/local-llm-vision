import { BusinessCardData } from '@/types/vision'

export interface CsvColumn {
  label: string
  getValue: (card: BusinessCardData) => string
}

// 出力するCSVカラム定義（順序はこの配列の通り）
// 名刺読み取り結果パネル (CARD_FIELDS) と 1:1 で対応させる。
// データが0件のカラムでもヘッダー行は必ず出力される。
export const CSV_COLUMNS: CsvColumn[] = [
  { label: '氏名',                 getValue: (c) => c.name },
  { label: '氏名（アルファベット）', getValue: (c) => c.nameAlphabet },
  { label: '氏名（ふりがな）',     getValue: (c) => c.nameKana },
  { label: '社名',                 getValue: (c) => c.company },
  { label: '部署',                 getValue: (c) => c.department },
  { label: '肩書き',               getValue: (c) => c.title },
  { label: '会社URL',              getValue: (c) => c.companyUrl },
  { label: '住所',                 getValue: (c) => c.address },
  { label: 'メールアドレス',       getValue: (c) => c.email },
  { label: '携帯番号',             getValue: (c) => c.mobile },
  { label: 'TEL（会社）',          getValue: (c) => c.tel },
  { label: 'FAX',                  getValue: (c) => c.fax },
]

// 与えられた文字列を https:// 始まりの URL に正規化する。
// - 空文字は空文字のまま返す
// - http:// は https:// に変換する
// - スキーム未指定（例: "example.com", "//example.com"）は https:// を補う
export function normalizeHttpsUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https:\/\//i.test(trimmed)) return trimmed
  if (/^http:\/\//i.test(trimmed)) return 'https://' + trimmed.slice('http://'.length)
  if (trimmed.startsWith('//')) return 'https:' + trimmed
  return 'https://' + trimmed
}

function escapeCsvField(value: string): string {
  // RFC 4180: ダブルクォート、カンマ、改行を含むフィールドは "" で囲む。
  // 内部のダブルクォートは "" にエスケープ。
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function cardsToCsv(cards: BusinessCardData[]): string {
  const header = CSV_COLUMNS.map((c) => escapeCsvField(c.label)).join(',')
  const rows = cards.map((card) =>
    CSV_COLUMNS.map((c) => escapeCsvField(c.getValue(card) ?? '')).join(',')
  )
  // CRLF 改行は Excel 等での互換性が高い
  return [header, ...rows].join('\r\n') + '\r\n'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function buildCsvFilename(date: Date = new Date()): string {
  const stamp =
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `_${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  return `business_cards_${stamp}.csv`
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM (U+FEFF) を付与すると Excel で UTF-8 が正しく解釈される
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
