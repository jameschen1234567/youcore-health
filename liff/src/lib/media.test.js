import { describe, expect, it } from 'vitest'
import { parseVideoUrl, validateMedia } from './media'

describe('影片連結解析', () => {
  it('Google 雲端各種格式', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUv'
    expect(parseVideoUrl(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toEqual({ provider: 'drive', id, embed: `https://drive.google.com/file/d/${id}/preview` })
    expect(parseVideoUrl(`https://drive.google.com/open?id=${id}`).id).toBe(id)
    expect(parseVideoUrl(`https://drive.google.com/uc?id=${id}&export=download`).id).toBe(id)
  })
  it('YouTube 各種格式', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?si=x').id).toBe('dQw4w9WgXcQ')
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').embed).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(parseVideoUrl('https://youtube.com/shorts/dQw4w9WgXcQ').id).toBe('dQw4w9WgXcQ')
  })
  it('不認得或不安全的連結', () => {
    expect(parseVideoUrl('http://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view')).toBeNull()
    expect(parseVideoUrl('https://example.com/v.mp4')).toBeNull()
    expect(parseVideoUrl('不是網址')).toBeNull()
    expect(parseVideoUrl('https://drive.google.com/drive/folders/abc')).toBeNull()
  })
})

describe('影像欄位驗證', () => {
  const base = { title: '深蹲', taken_on: '2026-11-28', note: '' }
  it('照片與對照要有檔案', () => {
    expect(validateMedia({ ...base, kind: 'photo' })).toMatch('照片')
    expect(validateMedia({ ...base, kind: 'photo', file1: {} })).toBeNull()
    expect(validateMedia({ ...base, kind: 'compare', file1: {} })).toMatch('兩張')
  })
  it('影片要能解析、修改時不用重選檔案', () => {
    expect(validateMedia({ ...base, kind: 'video', video_url: 'https://example.com' })).toMatch('連結')
    expect(validateMedia({ ...base, kind: 'photo', id: 'x' })).toBeNull()
    expect(validateMedia({ ...base, title: '', kind: 'photo', file1: {} })).toMatch('標題')
  })
})
