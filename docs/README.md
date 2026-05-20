# Local LLM Vision - ドキュメント一覧

Ollama 上の gemma4 を用いた画像認識・OCR・名刺読み取り Web アプリの設計書群。

## 設計書

| ファイル | 内容 |
|---|---|
| [01_overview.md](01_overview.md) | プロジェクト概要・機能一覧・技術スタック |
| [02_architecture.md](02_architecture.md) | ディレクトリ構成・各ファイルの責務・アーキテクチャ |
| [03_api_design.md](03_api_design.md) | APIエンドポイント仕様・リクエスト/レスポンス形式 |
| [04_ui_design.md](04_ui_design.md) | 画面構成・UI項目・状態管理・ボタン活性ルール |
| [05_sequence_diagrams.md](05_sequence_diagrams.md) | 処理フロー（シーケンス図） |
| [06_implementation_plan.md](06_implementation_plan.md) | フェーズ別実装計画・タスクチェックリスト |
| [07_prompts.md](07_prompts.md) | Gemma4向けプロンプト設計 |
| [08_performance_guidelines.md](08_performance_guidelines.md) | パフォーマンス方針・画像最適化設定 |

## 実装開始前の確認事項

1. Ollamaがインストール済みであること
   ```bash
   ollama --version
   ```

2. gemma4モデルが取得済みであること
   ```bash
   ollama list
   # gemma4 が表示されること
   ```

3. Ollamaが起動していること
   ```bash
   ollama serve
   ```

4. Node.js 18以上がインストール済みであること
   ```bash
   node --version
   ```

## クイックスタート

```bash
# プロジェクトルートで
npm install
npm run dev
# http://localhost:3000 にアクセス
```

## モード概要

- **通常認識モード**: カメラ映像を 2 秒ごとに OCR し、撮影ボタンで詳細な画像説明を取得
- **名刺読み取りモード**: カメラ映像を 3 秒ごとに自動スキャンして名刺フィールドを抽出。結果を編集して保存リストへ追加し、複数件まとめて CSV ダウンロード可
