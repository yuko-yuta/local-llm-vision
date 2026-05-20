'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resizeAndConvertToBase64, captureFrameFromVideo } from '@/lib/image'
import { buildCsvFilename, cardsToCsv, downloadCsv, normalizeHttpsUrl } from '@/lib/csv'
import { BusinessCardData } from '@/types/vision'

const OCR_MAX_CONSECUTIVE_ERRORS = 3

type AppMode = 'general' | 'card'

interface SavedCard {
  id: string
  data: BusinessCardData
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const CARD_FIELDS: {
  key: keyof BusinessCardData
  label: string
  placeholder?: string
  multiline?: boolean
}[] = [
  { key: 'name',         label: '氏名' },
  { key: 'nameAlphabet', label: '氏名（アルファベット）' },
  { key: 'nameKana',     label: '氏名（ふりがな）' },
  { key: 'company',      label: '社名' },
  { key: 'department',   label: '部署' },
  { key: 'title',        label: '肩書き' },
  { key: 'companyUrl',   label: '会社URL',           placeholder: 'https://example.com' },
  { key: 'address',      label: '住所',              multiline: true },
  { key: 'email',        label: 'メールアドレス' },
  { key: 'mobile',       label: '携帯番号' },
  { key: 'tel',          label: 'TEL（会社）' },
  { key: 'fax',          label: 'FAX' },
]

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

function isCardEmpty(card: BusinessCardData): boolean {
  return CARD_FIELDS.every(({ key }) => !card[key])
}

// AbortSignal.timeout が未サポートのブラウザ（iOS Safari 17.3 以前など）向け互換ラッパー
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

export default function VisionTester() {
  const [appMode, setAppMode] = useState<AppMode>('general')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [analyzeResult, setAnalyzeResult] = useState('')
  const [cardData, setCardData] = useState<BusinessCardData | null>(null)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [realtimeText, setRealtimeText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isAutoScanning, setIsAutoScanning] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isScanRunningRef = useRef(false)
  const prevOcrTextRef = useRef('')
  const prevCardJsonRef = useRef('')
  const errorCountRef = useRef(0)
  // cardData が編集対象として表示されている間は自動スキャンを停止するためのフラグ。
  // 直接 state を closure 経由で参照すると古い値を見るので ref で同期する。
  const hasCardDataRef = useRef(false)

  useEffect(() => {
    hasCardDataRef.current = cardData !== null
  }, [cardData])

  const stopLoop = useCallback(() => {
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current)
      loopIntervalRef.current = null
    }
    isScanRunningRef.current = false
    setIsAutoScanning(false)
  }, [])

  const stopCamera = useCallback((stream: MediaStream | null) => {
    if (!stream) return
    stream.getTracks().forEach((t) => t.stop())
    setCameraStream(null)
    setRealtimeText('')
    prevOcrTextRef.current = ''
    prevCardJsonRef.current = ''
    errorCountRef.current = 0
    stopLoop()
  }, [stopLoop])

  const startOcrLoop = useCallback(() => {
    errorCountRef.current = 0
    loopIntervalRef.current = setInterval(async () => {
      if (isScanRunningRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2 || video.videoWidth === 0) return
      isScanRunningRef.current = true
      try {
        const base64 = captureFrameFromVideo(video, 640, 0.7)
        const res = await fetch('/api/vision/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 }),
          signal: timeoutSignal(15000),
        })
        const data = await res.json()
        if (!res.ok) {
          errorCountRef.current++
          if (errorCountRef.current >= OCR_MAX_CONSECUTIVE_ERRORS) {
            stopLoop()
            setErrorMessage((data.error ?? '画像認識に失敗しました。') + ' リアルタイムOCRを停止しました。カメラを再起動してください。')
          }
          return
        }
        errorCountRef.current = 0
        if (typeof data.text === 'string' && data.text !== prevOcrTextRef.current) {
          prevOcrTextRef.current = data.text
          setRealtimeText(data.text)
        }
      } catch {
        errorCountRef.current++
        if (errorCountRef.current >= OCR_MAX_CONSECUTIVE_ERRORS) {
          stopLoop()
          setErrorMessage('リアルタイムOCRがタイムアウトしました。カメラを再起動してください。')
        }
      } finally {
        isScanRunningRef.current = false
      }
    }, 2000)
  }, [stopLoop])

  const startCardLoop = useCallback(() => {
    errorCountRef.current = 0
    prevCardJsonRef.current = ''
    loopIntervalRef.current = setInterval(async () => {
      if (isScanRunningRef.current) return
      // 編集中のデータを上書きしないため、cardData がある間はスキップ
      if (hasCardDataRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2 || video.videoWidth === 0) return
      isScanRunningRef.current = true
      setIsAutoScanning(true)
      try {
        const base64 = captureFrameFromVideo(video, 800, 0.85)
        const res = await fetch('/api/vision/card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 }),
          signal: timeoutSignal(60000),
        })
        const data = await res.json()
        if (!res.ok) {
          errorCountRef.current++
          if (errorCountRef.current >= OCR_MAX_CONSECUTIVE_ERRORS) {
            stopLoop()
            setErrorMessage((data.error ?? '名刺の読み取りに失敗しました。') + ' 自動スキャンを停止しました。カメラを再起動してください。')
          }
          return
        }
        errorCountRef.current = 0
        const newJson = JSON.stringify(data.card)
        if (newJson !== prevCardJsonRef.current) {
          prevCardJsonRef.current = newJson
          setCardData(data.card)
        }
      } catch {
        errorCountRef.current++
        if (errorCountRef.current >= OCR_MAX_CONSECUTIVE_ERRORS) {
          stopLoop()
          setErrorMessage('自動スキャンがタイムアウトしました。カメラを再起動してください。')
        }
      } finally {
        isScanRunningRef.current = false
        setIsAutoScanning(false)
      }
    }, 3000)
  }, [stopLoop])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (cameraStream) {
      video.srcObject = cameraStream
      if (appMode === 'general') startOcrLoop()
      else startCardLoop()
    } else {
      video.srcObject = null
      stopLoop()
    }
    return () => stopLoop()
  }, [cameraStream, appMode, startOcrLoop, startCardLoop, stopLoop])

  useEffect(() => {
    return () => {
      stopLoop()
      cameraStream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 保存済み名刺がある状態でページを離脱しようとした場合に確認ダイアログを出す
  useEffect(() => {
    if (savedCards.length === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 一部ブラウザでは returnValue の設定が必要
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [savedCards.length])

  const handleModeChange = (mode: AppMode) => {
    setAppMode(mode)
    setAnalyzeResult('')
    setCardData(null)
    setErrorMessage('')
    setStatusMessage('')
  }

  const handleCardFieldChange = (key: keyof BusinessCardData, value: string) => {
    setCardData((prev) => ({ ...(prev ?? EMPTY_CARD), [key]: value }))
  }

  const handleDiscardCurrentCard = () => {
    setCardData(null)
    prevCardJsonRef.current = ''
  }

  const handleSaveCurrentCard = () => {
    if (!cardData || isCardEmpty(cardData)) {
      setErrorMessage('保存できる名刺データがありません。')
      return
    }
    // 会社URL は https:// 始まりに正規化してから保存する
    const normalized: BusinessCardData = {
      ...cardData,
      companyUrl: normalizeHttpsUrl(cardData.companyUrl),
    }
    setSavedCards((prev) => [
      ...prev,
      { id: generateId(), data: normalized },
    ])
    // 次の名刺をスムーズに読み取れるよう現在の表示をリセット
    setCardData(null)
    prevCardJsonRef.current = ''
    setStatusMessage('名刺をリストに保存しました。')
    // ステータスは数秒で消す
    setTimeout(() => {
      setStatusMessage((cur) => (cur === '名刺をリストに保存しました。' ? '' : cur))
    }, 2000)
  }

  const handleDeleteSavedCard = (id: string) => {
    setSavedCards((prev) => prev.filter((c) => c.id !== id))
  }

  const handleDownloadCsv = () => {
    // 0件の場合もヘッダー行のみの CSV を出力する
    const csv = cardsToCsv(savedCards.map((c) => c.data))
    downloadCsv(buildCsvFilename(), csv)
  }

  const handleStartCamera = async () => {
    setErrorMessage('')
    setAnalyzeResult('')
    setCardData(null)
    setSelectedImage(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      // getCapabilities() は iOS Safari など一部ブラウザで未サポートのため存在確認してから呼ぶ
      const track = stream.getVideoTracks()[0]
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as Record<string, unknown>
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          await track
            .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
            .catch(() => {})
        }
      }
      setCameraStream(stream)
    } catch (err) {
      const name = err instanceof Error ? (err as { name?: string }).name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMessage('カメラの使用が許可されていません。ブラウザの設定を確認してください。')
      } else if (name === 'NotFoundError') {
        setErrorMessage('カメラが見つかりません。')
      } else {
        setErrorMessage('カメラの起動に失敗しました。HTTPSまたはlocalhost環境が必要です。')
      }
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErrorMessage('')
    setAnalyzeResult('')
    setCardData(null)
    stopCamera(cameraStream)
    try {
      const base64 = await resizeAndConvertToBase64(file, 1024, 0.8)
      setSelectedImage(base64)
    } catch {
      setErrorMessage('画像の読み込みに失敗しました。')
    }
    e.target.value = ''
  }

  const sendAnalyze = async (imageBase64: string) => {
    setIsAnalyzing(true)
    setErrorMessage('')
    setAnalyzeResult('')
    setStatusMessage('認識中...')
    try {
      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mode: 'general' }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setErrorMessage(data.error ?? '画像認識に失敗しました。')
      else setAnalyzeResult(data.result)
    } catch {
      setErrorMessage('画像認識に失敗しました。')
    } finally {
      setIsAnalyzing(false)
      setStatusMessage('')
    }
  }

  const sendCardScan = async (imageBase64: string) => {
    setIsAnalyzing(true)
    setErrorMessage('')
    setCardData(null)
    setStatusMessage('名刺を読み取り中...')
    try {
      const res = await fetch('/api/vision/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setErrorMessage(data.error ?? '名刺の読み取りに失敗しました。')
      else { prevCardJsonRef.current = JSON.stringify(data.card); setCardData(data.card) }
    } catch {
      setErrorMessage('名刺の読み取りに失敗しました。')
    } finally {
      setIsAnalyzing(false)
      setStatusMessage('')
    }
  }

  const handleScanImage = (base64: string) =>
    appMode === 'card' ? sendCardScan(base64) : sendAnalyze(base64)

  const handleAnalyzeUpload = () => {
    if (!selectedImage) { setErrorMessage('画像を選択してください。'); return }
    handleScanImage(selectedImage)
  }

  const handleCaptureAndAnalyze = () => {
    const video = videoRef.current
    if (!video || !cameraStream) return
    try { handleScanImage(captureFrameFromVideo(video, 1024, 0.8)) }
    catch { setErrorMessage('撮影に失敗しました。') }
  }

  const isCameraActive = cameraStream !== null

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-3 sm:p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold text-center text-white">Local LLM Vision</h1>

        {/* モード切替タブ — overflow-hidden は iOS Safari でタップを妨害するため使わず各ボタンに角丸を付ける */}
        <div className="flex border border-gray-700 rounded-lg w-fit">
          <button
            onClick={() => handleModeChange('general')}
            className={`px-4 py-3 text-sm font-medium rounded-l-lg transition-colors ${
              appMode === 'general' ? 'bg-indigo-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-400 active:bg-gray-600'
            }`}
          >
            通常認識
          </button>
          <button
            onClick={() => handleModeChange('card')}
            className={`px-4 py-3 text-sm font-medium rounded-r-lg border-l border-gray-700 transition-colors ${
              appMode === 'card' ? 'bg-indigo-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-400 active:bg-gray-600'
            }`}
          >
            名刺読み取り
          </button>
        </div>

        {/* カメラ操作ボタン */}
        <div className="flex gap-3 flex-wrap">
          {!isCameraActive ? (
            <button
              onClick={handleStartCamera}
              className="px-5 py-3 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
              disabled={isAnalyzing}
            >
              カメラ起動
            </button>
          ) : (
            <button
              onClick={() => stopCamera(cameraStream)}
              className="px-5 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-lg text-sm font-medium transition-colors"
            >
              カメラ停止
            </button>
          )}
        </div>

        {/* エラー・ステータス */}
        {statusMessage && <p className="text-yellow-400 text-sm animate-pulse">{statusMessage}</p>}
        {errorMessage && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {errorMessage}
          </div>
        )}

        {/*
          プレビュー + 結果エリア
          - スマホ (< md): 常に縦積み
          - PC (>= md) 名刺モード: 横並び (items-stretch)
          - PC (>= md) 通常モード: 縦積み
          video は常に同一 DOM 要素を維持（ref 安定）
        */}
        <div className={`flex gap-4 ${appMode === 'card' ? 'flex-col md:flex-row md:items-stretch' : 'flex-col'}`}>

          {/* カメラ / 画像プレビュー */}
          <div className={`relative bg-gray-800 rounded-xl overflow-hidden flex items-center justify-center min-h-56 sm:min-h-64 ${
            appMode === 'card' ? 'w-full md:flex-1 md:min-w-0' : 'w-full'
          }`}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain${isCameraActive ? '' : ' hidden'}`}
            />
            {!isCameraActive && (
              <p className="text-gray-500 text-sm text-center px-4">カメラを起動してください</p>
            )}
            {/* 名刺モード: スキャン状態インジケーター */}
            {isCameraActive && appMode === 'card' && (
              <div className="absolute bottom-2 left-2">
                {isAutoScanning ? (
                  <span className="flex items-center gap-1.5 bg-black/70 text-yellow-400 text-xs px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                    スキャン中...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 bg-black/70 text-green-400 text-xs px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                    自動スキャン待機中
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 名刺読み取り結果パネル */}
          {appMode === 'card' && (
            <div className="w-full md:w-80 md:shrink-0 bg-gray-800 rounded-xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-300">名刺読み取り結果</h2>
                {cardData && (
                  <span className="text-[10px] text-gray-500">編集可・スキャン停止中</span>
                )}
              </div>
              {cardData ? (
                <div className="flex-1 overflow-y-auto">
                  {CARD_FIELDS.map(({ key, label, placeholder, multiline }) => (
                    <div key={key} className="px-4 py-2 border-b border-gray-700/50 last:border-b-0">
                      <label className="block text-xs text-gray-500 mb-1" htmlFor={`card-field-${key}`}>
                        {label}
                      </label>
                      {multiline ? (
                        <textarea
                          id={`card-field-${key}`}
                          value={cardData[key]}
                          placeholder={placeholder}
                          onChange={(e) => handleCardFieldChange(key, e.target.value)}
                          rows={2}
                          className="w-full bg-gray-900 border border-gray-700 focus:border-indigo-500 focus:outline-none rounded px-2 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 resize-y"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      ) : (
                        <input
                          id={`card-field-${key}`}
                          type="text"
                          value={cardData[key]}
                          placeholder={placeholder}
                          onChange={(e) => handleCardFieldChange(key, e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 focus:border-indigo-500 focus:outline-none rounded px-2 py-1.5 text-sm text-gray-100 placeholder:text-gray-600"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-gray-500 text-sm">
                  {isCameraActive ? 'カメラに名刺を向けてください' : 'カメラを起動してください'}
                </div>
              )}
              {/* 保存・破棄ボタン: 読み取り結果がある場合のみ表示 */}
              {cardData && (
                <div className="border-t border-gray-700 p-3 flex gap-2">
                  <button
                    onClick={handleDiscardCurrentCard}
                    className="px-3 py-2.5 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-sm font-medium transition-colors shrink-0"
                  >
                    破棄
                  </button>
                  <button
                    onClick={handleSaveCurrentCard}
                    disabled={isCardEmpty(cardData)}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                  >
                    リストに保存
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* アクションボタン */}
        <div className="flex gap-3 flex-wrap">
          {isCameraActive && (
            <button
              onClick={handleCaptureAndAnalyze}
              className="px-5 py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
              disabled={isAnalyzing}
            >
              {isAnalyzing ? '処理中...' : appMode === 'card' ? '今すぐ読み取る' : '撮影して認識'}
            </button>
          )}
        </div>

        {/* 名刺モード: 保存済みリスト */}
        {appMode === 'card' && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                保存済み名刺{savedCards.length > 0 && ` (${savedCards.length}件)`}
              </h2>
              <button
                onClick={handleDownloadCsv}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg text-sm font-medium transition-colors"
              >
                CSV ダウンロード
              </button>
            </div>
            {savedCards.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-500 text-center">
                まだ保存された名刺はありません。読み取り結果パネルの「リストに保存」を押して追加してください。
              </div>
            ) : (
              <ul className="bg-gray-800 rounded-lg divide-y divide-gray-700/50 overflow-hidden">
                {savedCards.map((card, index) => (
                  <li key={card.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="text-xs text-gray-500 tabular-nums pt-0.5 w-6 shrink-0 text-right">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-100 font-medium break-all">
                        {card.data.name || <span className="text-gray-600">（氏名なし）</span>}
                        {card.data.nameKana && (
                          <span className="text-xs text-gray-500 font-normal ml-1.5">({card.data.nameKana})</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 break-all mt-0.5">
                        {card.data.company || '—'}
                        {card.data.department && ` / ${card.data.department}`}
                        {card.data.title && ` / ${card.data.title}`}
                      </div>
                      {(card.data.mobile || card.data.tel) && (
                        <div className="text-xs text-gray-500 break-all mt-0.5">
                          {card.data.mobile || card.data.tel}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteSavedCard(card.id)}
                      className="shrink-0 px-2.5 py-1.5 text-xs bg-red-900/40 hover:bg-red-800/60 active:bg-red-800 text-red-200 rounded transition-colors"
                      aria-label={`${card.data.name || '名刺'}を削除`}
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500">
              ※ 保存データはこのページを離れる（リロード・タブを閉じる）と消えます。CSV をダウンロードしてから移動してください。
            </p>
          </section>
        )}

        {/* 通常モード: OCR・認識結果 */}
        {appMode === 'general' && (
          <div className="space-y-4">
            {isCameraActive && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">リアルタイム文字認識</h2>
                <div className="bg-gray-800 rounded-lg p-4 min-h-16 text-sm text-gray-200 whitespace-pre-wrap break-words">
                  {realtimeText}
                </div>
              </section>
            )}
            {analyzeResult && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">画像認識結果</h2>
                <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                  {analyzeResult}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
