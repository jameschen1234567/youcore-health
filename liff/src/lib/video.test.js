import { describe, it, expect } from 'vitest'
import { toEmbedUrl, isVertical } from './video'

describe('toEmbedUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc123XYZ_-', 'https://www.youtube-nocookie.com/embed/abc123XYZ_-'],
    ['https://youtu.be/abc123?t=10', 'https://www.youtube-nocookie.com/embed/abc123'],
    ['https://youtube.com/shorts/short01', 'https://www.youtube-nocookie.com/embed/short01'],
    ['https://m.youtube.com/watch?v=mob1', 'https://www.youtube-nocookie.com/embed/mob1'],
    ['https://www.instagram.com/reel/CODE_1/?igsh=xx', 'https://www.instagram.com/reel/CODE_1/embed'],
    ['https://www.instagram.com/reels/CODE_2/', 'https://www.instagram.com/reel/CODE_2/embed'],
    ['https://www.instagram.com/p/POST3/', 'https://www.instagram.com/p/POST3/embed'],
  ])('%s', (input, expected) => {
    expect(toEmbedUrl(input)).toBe(expected)
  })

  it.each([null, '', 'not a url', 'https://vimeo.com/123', 'https://www.youtube.com/watch', 'https://www.instagram.com/youcore/'])(
    'unsupported: %s', (input) => {
      expect(toEmbedUrl(input)).toBeNull()
    })
})

describe('isVertical', () => {
  it('shorts and instagram are vertical', () => {
    expect(isVertical('https://youtube.com/shorts/x')).toBe(true)
    expect(isVertical('https://www.instagram.com/reel/x/')).toBe(true)
    expect(isVertical('https://www.youtube.com/watch?v=x')).toBe(false)
  })
})
