import { describe, expect, it } from 'vitest'
import { contactError } from './requests'

const ok = { full_name: '王小明', gender: 'male', birthday: '1990-01-01', phone: '0912-345-678' }
describe('contactError', () => {
  it('齊全', () => {
    expect(contactError(ok)).toBe('')
    expect(contactError({ ...ok, phone: '+886 912 345 678' })).toBe('')
  })
  it('缺欄位或格式不對', () => {
    expect(contactError({ ...ok, full_name: ' ' })).toContain('姓名')
    expect(contactError({ ...ok, gender: '' })).toContain('性別')
    expect(contactError({ ...ok, birthday: '' })).toContain('生日')
    expect(contactError({ ...ok, birthday: '2099-01-01' })).toContain('生日')
    for (const phone of ['', '02-26539433', '091234567', '09123456789']) expect(contactError({ ...ok, phone })).toContain('手機')
  })
})
