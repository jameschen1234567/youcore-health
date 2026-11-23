import { describe, expect, it } from 'vitest'
import { firstText, injectMeta } from './og.js'

describe('分享預覽', () => {
  it('firstText 跳過標題取第一段', () => {
    const body = [
      { type: 'heading_2', text: [{ text: '標題' }] },
      { type: 'paragraph', text: [{ text: '久坐的人' }, { text: '常常肩頸緊。' }] },
    ]
    expect(firstText(body)).toBe('久坐的人常常肩頸緊。')
    expect(firstText([{ type: 'paragraph', text: [{ text: 'x'.repeat(100) }] }], 10)).toBe(`${'x'.repeat(10)}…`)
  })
  it('injectMeta 換標題、加 og 並跳脫', () => {
    const html = '<html><head><title>宥芯健筋療育所</title></head><body></body></html>'
    const out = injectMeta(html, { title: '肩頸 "痠痛" <三招>', description: 'd', image: 'https://x/a.jpg', url: 'https://y/content/1' })
    expect(out).toContain('<title>肩頸 &quot;痠痛&quot; &lt;三招&gt;｜宥芯健筋療育所</title>')
    expect(out).toContain('<meta property="og:image" content="https://x/a.jpg" />')
    expect(out).toContain('og:url" content="https://y/content/1"')
  })
})
