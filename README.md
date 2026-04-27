# Local LLM Vision

Ollama + Gemma4 を使ったローカル完結の画像認識 Web アプリです。カメラ映像のリアルタイム OCR と名刺の自動スキャンに対応しています。

## 必要環境

- Node.js 20+
- [Ollama](https://ollama.com/) がインストール済みで起動していること
- Gemma4 モデルがプル済みであること

```bash
ollama pull gemma4:e4b
```

## セットアップ

```bash
npm install
```

プロジェクトルートに `.env.local` を作成します。

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4:e4b
```

> Windows 11 では `localhost` が IPv6 に解決されるため、`127.0.0.1` を明示してください。

## 起動

```bash
npm run dev
```

`http://localhost:3000` をブラウザで開きます。

## 機能

### 通常認識モード

カメラ映像を 2 秒ごとに自動 OCR し、認識したテキストをリアルタイム表示します。「撮影して認識」ボタンで任意のタイミングに詳細な画像解析も実行できます。

### 名刺読み取りモード

カメラに名刺を向けると 3 秒ごとに自動スキャンが実行され、以下 10 項目を構造化して表示します。

- 氏名（漢字 / アルファベット / ふりがな）
- 所属会社 / 役職・肩書
- 会社住所（ビル名・階数・部屋番号を含む）
- メールアドレス / TEL / FAX / Mobile

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| フレームワーク | Next.js 16 (App Router) |
| UI | React 19 / Tailwind CSS v4 |
| 言語 | TypeScript |
| LLM 基盤 | Ollama |
| モデル | Gemma4 (`gemma4:e4b`) |
