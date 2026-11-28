// 客戶端（會員）：設定 iPhone 自動同步 — 產生同步碼、安裝捷徑、看最後同步時間、停用
import { useEffect, useRef, useState } from 'react'
import { DEMO, HEALTH_SHORTCUT_URL } from '../config'
import { fmtSyncTime, getSyncStatus, isIOS, isStale, issueSyncToken, revokeSync, runShortcutUrl } from '../lib/healthSync'

export default function HealthSyncCard({ profile, nutrition, onSynced }) {
  const [st, setSt] = useState(undefined)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmOff, setConfirmOff] = useState(false)

  const reload = () => getSyncStatus(profile.id).then(setSt).catch(() => setSt(null))
  useEffect(() => { reload() }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 按「立即同步」→ 跳去捷徑 → 回到 App 時重新抓資料
  const pending = useRef(false)
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== 'visible' || !pending.current) return
      pending.current = false
      setTimeout(() => { reload(); onSynced?.() }, 1500)
    }
    document.addEventListener('visibilitychange', onBack)
    return () => document.removeEventListener('visibilitychange', onBack)
  }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const canRun = isIOS() || DEMO
  function runNow() { pending.current = true; window.location.href = runShortcutUrl() }

  async function issue() {
    setBusy(true); setMsg('')
    try { setToken(await issueSyncToken(profile.id)); await reload() } catch { setMsg('產生失敗，請稍後再試') } finally { setBusy(false) }
  }
  async function off() {
    setBusy(true); setMsg('')
    try { await revokeSync(profile.id); setToken(''); setConfirmOff(false); await reload(); onSynced?.() } catch { setMsg('停用失敗，請稍後再試') } finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(token); setMsg('已複製') } catch { setMsg('複製失敗，請長按同步碼手動複製') }
  }

  if (st === undefined) return null
  const last = fmtSyncTime(st?.last_sync_at)

  return (
    <section className="card">
      <h2>iPhone 自動同步</h2>
      {!st && !token && (
        <>
          <p className="small">設定一次，之後每天晚上自動把「健康」App 的{nutrition ? '步數、活動能量、' : ''}安靜心率傳上來，不用再手動填。</p>
          <button className="btn primary" disabled={busy} onClick={issue}>{busy ? '產生中…' : '開始設定'}</button>
        </>
      )}

      {token && (
        <div className="sync-token">
          <p className="small"><b>步驟 1：複製你的同步碼</b>（只會顯示這一次，請不要給別人）</p>
          <code className="token-box">{token}</code>
          <button className="btn ghost" onClick={copy}>複製同步碼</button>
          <p className="small"><b>步驟 2：安裝捷徑</b>，安裝時會請你貼上同步碼。</p>
          {HEALTH_SHORTCUT_URL
            ? <a className="btn primary" href={HEALTH_SHORTCUT_URL} target="_blank" rel="noreferrer">安裝捷徑</a>
            : <p className="muted small">捷徑還在準備中，教練準備好會通知你。同步碼可以之後再重新產生。</p>}
          <p className="small"><b>步驟 3：設定每天自動執行</b></p>
          <ol className="small">
            <li>打開「捷徑」App → 下方「自動化」→ 右上角「＋」</li>
            <li>選「時間」→ 設 22:00、每天 → 選「立即執行」</li>
            <li>選「宥芯同步」這個捷徑 → 完成</li>
            <li>回到「捷徑」分頁，手動按一次「宥芯同步」，允許讀取健康資料</li>
          </ol>
          <button className="btn ghost" onClick={() => { setToken(''); setMsg(''); reload() }}>我設定好了</button>
        </div>
      )}

      {st && (
        <p className="small">
          {last ? <>最後同步：<b>{last}</b></> : '已產生同步碼，還沒收到資料。設定好捷徑後手動執行一次試試看。'}
          {isStale(st.last_sync_at) && <span className="danger-text">（超過 2 天沒同步，檢查一下捷徑自動化有沒有被關掉）</span>}
        </p>
      )}
      {st && !token && canRun && (
        <div className="sync-now">
          <button className="btn primary" onClick={runNow}>立即同步</button>
          <span className="muted small">會打開「捷徑」跑一次，跑完自動回來。沒反應的話，請先完成捷徑設定，捷徑名稱要是「宥芯同步」。</span>
        </div>
      )}
      {st && !nutrition && <p className="muted small">目前只會存安靜心率；步數和活動熱量要等教練開放熱量功能才會存。</p>}
      {st && !token && (
        <div className="row">
          <button className="btn ghost" disabled={busy} onClick={issue}>重新產生同步碼</button>
          {confirmOff
            ? <><button className="btn danger" disabled={busy} onClick={off}>確定停用</button><button className="btn ghost" onClick={() => setConfirmOff(false)}>取消</button></>
            : <button className="btn ghost" onClick={() => setConfirmOff(true)}>停用</button>}
        </div>
      )}
      {st && !token && <p className="muted small">換手機或懷疑同步碼外流時按「重新產生」，舊的會立刻失效，捷徑裡也要換成新的。已同步的資料不會被刪掉。</p>}
      {msg && <p className="small">{msg}</p>}
      <p className="muted small">Android 目前不支援自動同步，請在下方手動填。</p>
    </section>
  )
}
