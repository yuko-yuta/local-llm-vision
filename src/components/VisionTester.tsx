'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resizeAndConvertToBase64, captureFrameFromVideo } from '@/lib/image'
import { BusinessCardData } from '@/types/vision'

const OCR_MAX_CONSECUTIVE_ERRORS = 3

type AppMode = 'general' | 'card'

const CARD_FIELDS: { key: keyof BusinessCardData; label: string }[] = [
  { key: 'name',          label: '氏名' },
  { key: 'nameAlphabet',  label: '氏名（アルファベット）' },
  { key: 'nameKana',      label: '氏名（ふりがな）' },
  { key: 'company',       label: '所属会社' },
  { key: 'title',         label: '肩書' },
  { key: 'address',       label: '会社住所' },
  { key: 'email',         label: 'メールアドレス' },
  { key: 'tel',           label: 'TEL（会社）' },
  { key: 'fax',           label: 'FAX' },
  { key: 'mobile',        label: 'Mobile（携帯）' },
]

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

  const handleModeChange = (mode: AppMode) => {
    setAppMode(mode)
    setAnalyzeResult('')
    setCardData(null)
    setErrorMessage('')
    setStatusMessage('')
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
              <div className="px-4 py-3 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-gray-300">名刺読み取り結果</h2>
              </div>
              {cardData ? (
                <dl className="flex-1 overflow-y-auto divide-y divide-gray-700/50">
                  {CARD_FIELDS.map(({ key, label }) => (
                    <div key={key} className="px-4 py-2.5">
                      <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
                      <dd className="text-sm text-gray-100 break-all">
                        {cardData[key] || <span className="text-gray-600">—</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-gray-500 text-sm">
                  {isCameraActive ? 'カメラに名刺を向けてください' : 'カメラを起動してください'}
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
