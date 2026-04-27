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
  name: string
  nameAlphabet: string
  nameKana: string
  company: string
  title: string
  address: string
  email: string
  tel: string
  fax: string
  mobile: string
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
