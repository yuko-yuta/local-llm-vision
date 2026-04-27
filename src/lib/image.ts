export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'))
    reader.readAsDataURL(file)
  })
}

export function resizeAndConvertToBase64(
  file: File,
  maxWidth = 1024,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas の初期化に失敗しました。'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました。'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'))
    reader.readAsDataURL(file)
  })
}

export function captureFrameFromVideo(
  videoEl: HTMLVideoElement,
  maxWidth = 640,
  quality = 0.7
): string {
  const scale = videoEl.videoWidth > maxWidth ? maxWidth / videoEl.videoWidth : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(videoEl.videoWidth * scale)
  canvas.height = Math.round(videoEl.videoHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas の初期化に失敗しました。')
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}
