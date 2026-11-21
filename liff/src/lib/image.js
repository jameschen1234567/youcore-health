// 手機照片前處理：轉正（EXIF）、縮到長邊 2000 px、轉成 JPEG。
// iPhone 的 HEIC 由瀏覽器解碼後一樣輸出 JPEG；無法解碼時丟出錯誤。
const MAX_SIDE = 2000

export async function prepareImage(file) {
  const bitmap = await decode(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('UNREADABLE_IMAGE')
  return blob
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch { /* 改用 <img> 再試 */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error('UNREADABLE_IMAGE')
  } finally {
    URL.revokeObjectURL(url)
  }
}
