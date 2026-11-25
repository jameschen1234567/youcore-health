// 足型自評：量腳 → 足弓（左、右）→ 鞋墊 → 送出，產生初步報告。量腳與量鞋墊都必填
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { submitAssessment } from '../lib/api'
import { getProfileInfo } from '../lib/training'
import { ageFrom } from '../lib/strength'
import { prepareImage } from '../lib/image'
import { RANGES, checkWidths, footWarnings, insolePoints, insoleWarnings, INSOLE_SIDE_LABELS, parseCm, toCm } from '../lib/foot'
import { ARCH_VERSION, FOOTPRINTS, PAINS, RED_FLAGS, TIPTOE, USES, buildAssessment, footPoints, measureArch } from '../lib/archModel'
import { ArchGuide, FootGuide, InsoleGuide } from '../components/FootGuides'
import ArchMarker from '../components/ArchMarker'

const STEPS = ['量左腳', '量右腳', '左腳足弓', '右腳足弓', '量鞋墊', '其他狀況']
const L = { left: '左腳', right: '右腳' }
const EMPTY = { feet: { left: { w: {} }, right: { w: {} } }, arch: { left: {}, right: {} }, insole: { side: 'both', w: {} }, red: [], pain: [], use: 'daily' }
const draftKey = (id) => `youcore-foot-draft:${id}`
const loadDraft = (id) => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(draftKey(id))) } } catch { return EMPTY } }

export default function FootMeasure() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [step, setStep] = useState(0)
  const [f, setF] = useState(() => loadDraft(profile.id))
  const [photos, setPhotos] = useState({}) // side → { blob, url, size }，不存草稿
  const [age, setAge] = useState(null)
  const [err, setErr] = useState('')
  const [warn, setWarn] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getProfileInfo(profile.id).then((i) => setAge(ageFrom(i?.birthday))).catch(() => {}) }, [profile.id])
  useEffect(() => {
    // 標點要搭配照片才有意義，離開頁面後照片不在，所以不存點
    const arch = { left: { ...f.arch.left, points: undefined }, right: { ...f.arch.right, points: undefined } }
    try { localStorage.setItem(draftKey(profile.id), JSON.stringify({ ...f, arch })) } catch { /* 私密模式忽略 */ }
  }, [f, profile.id])

  const side = step === 0 || step === 2 ? 'left' : 'right'
  const patch = (group, s, v) => { setErr(''); setWarn(null); setF((x) => ({ ...x, [group]: s ? { ...x[group], [s]: { ...x[group][s], ...v } } : { ...x[group], ...v } })) }

  // 每一步的檢查：回傳 { error } 或 { value, warnings }
  function readFoot(s) {
    const a = f.feet[s]
    const get = (k, range, name) => parseCm(a[k], range, `${L[s]}${name}`)
    const length = get('length', RANGES.length, '足長')
    if (length.error) return length
    const ball = get('ball', [80, length.mm - 10], '腳跟到大拇趾根部的長度')
    if (ball.error) return ball
    const width = get('width', RANGES.width, '前掌最寬')
    if (width.error) return width
    const heel = get('heel', RANGES.heel, '腳跟最寬')
    if (heel.error) return heel
    const widths = []
    for (const [i, p] of footPoints(length.mm).entries()) {
      const r = parseCm(a.w[i], [20, 160], `${L[s]}距腳跟 ${toCm(p)} 公分的寬度`)
      if (r.error) return r
      widths.push([p, r.mm])
    }
    const warnings = [...footWarnings({ length: length.mm, width: width.mm, heel: heel.mm }), ...insoleWarnings(widths)]
    const ratio = ball.mm / length.mm
    if (ratio < 0.62 || ratio > 0.82) warnings.push('腳跟到大拇趾根部的長度，通常約是足長的 7 成，請確認記號位置。')
    if (widths.some(([, w]) => w > width.mm + 3)) warnings.push('有位置比「前掌最寬」還寬，請確認。')
    let clearance = null
    if (a.clearance?.trim()) {
      const c = parseCm(a.clearance, [0, 60], `${L[s]}足弓高度`)
      if (c.error) return c
      clearance = c.mm
    }
    return { value: { side: s, length_mm: length.mm, ball_length_mm: ball.mm, width_mm: width.mm, heel_width_mm: heel.mm, widths, arch_clearance_mm: clearance }, warnings }
  }
  function readArch(s) {
    const a = f.arch[s]
    const out = { footprint: a.footprint || null, tiptoe: a.tiptoe || null }
    if (a.nav?.trim()) {
      const r = parseCm(a.nav, [10, 90], `${L[s]}舟狀骨高度`)
      if (r.error) return r
      out.nav_height_mm = r.mm
    }
    if (photos[s]) {
      const foot = readFoot(s)
      if (foot.error) return foot
      const m = measureArch(a.points, foot.value.length_mm)
      if (m.error) return { error: `${L[s]}：${m.error}` }
      out.points = a.points
      out.photo_size = photos[s].size
    }
    const warnings = !photos[s] && !out.nav_height_mm && !out.footprint ? [`${L[s]}沒有足弓資料，報告會顯示「無法判定」，可以到店再量。`] : []
    return { value: out, warnings }
  }
  function readInsole() {
    const a = f.insole
    const len = parseCm(a.length, RANGES.length, '鞋墊長度')
    if (len.error) return len
    const widths = []
    for (const [i, p] of insolePoints(len.mm).entries()) {
      const r = parseCm(a.w[i], RANGES.insoleWidth, `鞋墊距腳跟 ${toCm(p)} 公分的寬度`)
      if (r.error) return r
      widths.push([p, r.mm])
    }
    const c = checkWidths(widths, len.mm)
    if (c.error) return c
    return { value: { side: a.side, length_mm: len.mm, widths, note: a.note?.trim() || null }, warnings: insoleWarnings(widths) }
  }
  const READ = [() => readFoot('left'), () => readFoot('right'), () => readArch('left'), () => readArch('right'), readInsole,
    () => (f.pain.length ? { warnings: [] } : { error: '請選擇有沒有不舒服的位置' })]

  async function next() {
    setErr('')
    const r = READ[step]()
    if (r.error) return setErr(r.error)
    if (r.warnings.length && !warn) return setWarn(r.warnings)
    setWarn(null)
    if (step < STEPS.length - 1) { setStep(step + 1); window.scrollTo(0, 0); return }
    // 送出前整份再檢查一次（草稿還原後可能有缺）
    const all = READ.map((fn) => fn())
    const bad = all.findIndex((x) => x.error)
    if (bad >= 0) { setStep(bad); return setErr(all[bad].error) }
    const [fl, fr, al, ar, insole] = all.map((x) => x.value)
    const data = { feet: { left: fl, right: fr }, arch: { left: al, right: ar }, insole, red_flags: f.red, pain: f.pain, use: f.use, age }
    setBusy(true)
    try {
      const { photoFailed } = await submitAssessment(profile.id, { data, result: buildAssessment(data, age), algo: ARCH_VERSION, photos: { left: photos.left?.blob, right: photos.right?.blob } })
      try { localStorage.removeItem(draftKey(profile.id)) } catch { /* 忽略 */ }
      navigate(`/foot?new=1${photoFailed ? '&photo=0' : ''}`)
    } catch (e) {
      setErr(String(e?.message).includes('TOO_MANY') ? '24 小時內最多送出 5 次，請明天再試。' : '送出失敗，請確認網路後再試一次。填的內容還在。')
      setBusy(false)
    }
  }

  async function onPhoto(s, e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    try {
      const blob = await Promise.race([prepareImage(file), new Promise((_, no) => setTimeout(() => no(new Error('TIMEOUT')), 20000))])
      if (photos[s]) URL.revokeObjectURL(photos[s].url)
      setPhotos((p) => ({ ...p, [s]: { blob, url: URL.createObjectURL(blob) } }))
      patch('arch', s, { points: {} })
    } catch { setErr('這張照片無法讀取，請換一張或重新拍。') }
  }
  const dropPhoto = (s) => { URL.revokeObjectURL(photos[s].url); setPhotos((p) => ({ ...p, [s]: undefined })); patch('arch', s, { points: undefined }) }

  const foot = f.feet[side]
  const footLen = parseCm(foot.length, RANGES.length, '足長')
  const arch = f.arch[side]
  const insLen = parseCm(f.insole.length, RANGES.length, '鞋墊長度')
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))
  const togglePain = (v) => { setErr(''); setF((x) => ({ ...x, pain: v === 'none' ? ['none'] : [...x.pain.filter((y) => y !== 'none' && y !== v), ...(x.pain.includes(v) ? [] : [v])] })) }

  return (
    <main className="page">
      <button className="back" onClick={() => { setErr(''); setWarn(null); if (step) setStep(step - 1); else navigate('/foot') }}>‹ {step ? '上一步' : '足部與鞋墊'}</button>
      <p className="eyebrow">步驟 {step + 1} / {STEPS.length}</p>
      <h1>{STEPS[step]}</h1>

      {step < 2 && (
        <>
          {step === 0 && <FootGuide />}
          <section className="card" key={side}>
            <p className="muted small">單位都是<b>公分</b>，量到小數一位。</p>
            <div className="form-grid two-col">
              <Num label="足長（腳跟到最長的腳趾）" v={foot.length} ph="例如 24.5" on={(v) => patch('feet', side, { length: v, w: {} })} />
              <Num label="腳跟到大拇趾根部骨頭" v={foot.ball} ph="例如 17.8" on={(v) => patch('feet', side, { ball: v })} />
              <Num label="前掌最寬" v={foot.width} ph="例如 9.6" on={(v) => patch('feet', side, { width: v })} />
              <Num label="腳跟最寬" v={foot.heel} ph="例如 6.2" on={(v) => patch('feet', side, { heel: v })} />
            </div>
            {footLen.mm && (
              <>
                <p className="small"><b>整個腳型的寬度</b>：在輪廓上這些位置，量左右兩側的距離</p>
                <div className="form-grid two-col">
                  {footPoints(footLen.mm).map((p, i) => <Num key={p} label={`距腳跟 ${toCm(p)} 公分`} v={foot.w[i]} ph="寬度" on={(v) => patch('feet', side, { w: { ...foot.w, [i]: v } })} />)}
                </div>
              </>
            )}
            <div className="form-grid">
              <Num label="內側足弓高度（選填，量不出來可以空白）" v={foot.clearance} ph="例如 1.8" on={(v) => patch('feet', side, { clearance: v })} />
            </div>
            <p className="muted small">站著，把尺從腳內側平伸到足弓下面，碰到皮膚的最高點離地多高。大概估計就可以，到店會再量。</p>
          </section>
        </>
      )}

      {(step === 2 || step === 3) && (
        <>
          {step === 2 && <ArchGuide />}
          <section className="card" key={side}>
            <h2>側面照（建議）</h2>
            {photos[side] ? (
              <>
                <ArchMarker key={photos[side].url} src={photos[side].url} points={arch.points ?? {}} onChange={(points) => patch('arch', side, { points })}
                  onSize={(size) => setPhotos((p) => ({ ...p, [side]: { ...p[side], size } }))} />
                <button className="link-btn" onClick={() => dropPhoto(side)}>移除照片</button>
              </>
            ) : <p className="muted small">沒有照片也可以用下面的方式，但照片標點的結果會比較完整。</p>}
            <label className="btn ghost block file-btn">{photos[side] ? '換一張照片' : `📷 拍照或選${L[side]}內側照片`}
              <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(side, e)} data-testid={`arch-${side}`} />
            </label>
          </section>
          <section className="card">
            <h2>自己觀察</h2>
            <div className="form-grid">
              <Num label="舟狀骨離地高度（公分，選填）" v={arch.nav} ph="站著量，例如 4.5" on={(v) => patch('arch', side, { nav: v })} />
              <label className="small">濕腳印（腳沾濕踩在紙上，看中間那一段）
                <select value={arch.footprint ?? ''} onChange={(e) => patch('arch', side, { footprint: e.target.value })}>
                  {FOOTPRINTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              </label>
              <label className="small">扶牆踮腳，看內側足弓
                <select value={arch.tiptoe ?? ''} onChange={(e) => patch('arch', side, { tiptoe: e.target.value })}>
                  {TIPTOE.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              </label>
            </div>
          </section>
        </>
      )}

      {step === 4 && (
        <>
          <InsoleGuide />
          <section className="card">
            <div className="form-grid">
              <label className="small">哪一雙鞋（選填）<input className="search" maxLength={100} value={f.insole.note ?? ''} onChange={(e) => patch('insole', null, { note: e.target.value })} placeholder="例如：平常上班的布鞋" /></label>
              <label className="small">量的是哪一腳
                <select value={f.insole.side} onChange={(e) => patch('insole', null, { side: e.target.value })}>
                  {['both', 'left', 'right'].map((s) => <option key={s} value={s}>{INSOLE_SIDE_LABELS[s]}</option>)}
                </select>
              </label>
              <Num label="鞋墊長度（公分）" v={f.insole.length} ph="例如 25.5" on={(v) => patch('insole', null, { length: v, w: {} })} />
            </div>
            {f.insole.length && insLen.error && <p className="muted small">{insLen.error}</p>}
            {insLen.mm && (
              <>
                <p className="small"><b>在這些位置做記號，量寬度（公分）</b></p>
                <div className="form-grid two-col">
                  {insolePoints(insLen.mm).map((p, i) => <Num key={p} label={`距腳跟 ${toCm(p)} 公分`} v={f.insole.w[i]} ph="寬度" on={(v) => patch('insole', null, { w: { ...f.insole.w, [i]: v } })} />)}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {step === 5 && (
        <section className="card">
          <p className="small"><b>有沒有不舒服的位置？</b>（可複選）</p>
          <div className="chips wrap">{PAINS.map(([k, t]) => <button key={k} className={`chip ${f.pain.includes(k) ? 'on' : ''}`} aria-pressed={f.pain.includes(k)} onClick={() => togglePain(k)}>{t}</button>)}</div>
          <p className="small"><b>鞋墊主要用在</b></p>
          <div className="chips wrap">{USES.map(([k, t]) => <button key={k} className={`chip ${f.use === k ? 'on' : ''}`} aria-pressed={f.use === k} onClick={() => setF((x) => ({ ...x, use: k }))}>{t}</button>)}</div>
          <p className="small"><b>有以下狀況請勾選</b></p>
          {RED_FLAGS.map(([k, t]) => <label key={k} className="small check-row"><input type="checkbox" checked={f.red.includes(k)} onChange={() => toggle('red', k)} />{t}</label>)}
        </section>
      )}

      {warn?.map((w) => <p key={w} className="banner warn">{w}</p>)}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn primary block" disabled={busy} onClick={next}>{busy ? '送出中…' : warn ? '確認沒錯，繼續' : step === STEPS.length - 1 ? '送出，看初步報告' : '下一步'}</button>
    </main>
  )
}

function Num({ label, v, ph, on }) {
  return <label className="small">{label}<input className="search" inputMode="decimal" value={v ?? ''} placeholder={ph} aria-label={label} onChange={(e) => on(e.target.value)} /></label>
}
