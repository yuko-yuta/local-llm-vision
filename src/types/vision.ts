export interface AnalyzeRequest {
  imageBase64: string
  mode?: 'general'
}

export interface AnalyzeResponse {
  result: string
}

export interface OcrRequest {
  imageBase64: string
}

export interface OcrResponse {
  text: string
}

export interface BusinessCardData {
  name: string          // 氏名
  nameAlphabet: string  // 氏名（アルファベット）
  nameKana: string      // ふりがな
  company: string       // 社名
  department: string    // 部署
  title: string         // 肩書き
  companyUrl: string    // 会社URL
  address: string       // 住所
  email: string         // メールアドレス
  tel: string           // TEL（会社）
  fax: string           // FAX
  mobile: string        // 携帯番号
}

export interface CardRequest {
  imageBase64: string
}

export interface CardResponse {
  card: BusinessCardData
}

export interface OllamaChatMessage {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
}

export interface OllamaChatRequest {
  model: string
  messages: OllamaChatMessage[]
  stream: boolean
}

export interface OllamaChatResponse {
  model: string
  created_at: string
  message: OllamaChatMessage
  done: boolean
}
