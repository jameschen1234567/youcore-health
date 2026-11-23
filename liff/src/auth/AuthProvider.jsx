// 登入流程：LIFF 初始化 → 取得 LINE ID token → line-auth 驗證 → Supabase session
// 衛教文章是公開頁面，不必登入；進入需要身份的頁面時才呼叫 start() 開始登入。
// Demo 模式直接給一個假身份。
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import liff from '@line/liff'
import { DEMO, DEMO_ROLE } from '../config'
import { liffReady } from '../lib/liffClient'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const RETRY_KEY = 'youcore-line-relogin'
const DEMO_PROFILE ={ id: 'demo-user', display_name: '體驗用戶', role: DEMO_ROLE }

async function loginWithLine() {
  await liffReady()
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href })
    return null // 會跳轉到 LINE 登入頁
  }

  // 已有有效 session 就直接用，不必每次重新驗證
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    const profile = await loadProfile()
    if (profile) return profile
    // 本機殘留的 session 已失效（帳號被刪、換了 LINE channel 等）→ 清掉重新驗證
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  }

  const idToken = liff.getIDToken()
  if (!idToken) throw new Error('無法取得 LINE 身份，請重新開啟頁面')
  const { data, error } = await supabase.functions.invoke('line-auth', { body: { idToken } })
  if (error || !data?.tokenHash) {
    // LINE 的 ID token 可能已過期（手機長時間未重新登入）→ 重新走一次 LINE 登入，只重試一次避免循環
    // 用 localStorage + 時間戳：LINE 內建瀏覽器跳轉後 sessionStorage 不一定保留
    const last = Number(localStorage.getItem(RETRY_KEY) || 0)
    if (Date.now() - last > 120000) {
      localStorage.setItem(RETRY_KEY, String(Date.now()))
      liff.logout()
      liff.login({ redirectUri: window.location.href })
      return null
    }
    localStorage.removeItem(RETRY_KEY)
    throw new Error('LINE 登入驗證失敗')
  }
  localStorage.removeItem(RETRY_KEY)
  const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' })
  if (otpErr) throw otpErr

  const profile = await loadProfile()
  if (!profile) throw new Error('找不到帳號資料，請重新開啟頁面')
  return profile
}

/** 以目前 session 讀取 profile；session 失效或沒有對應 profile 時回傳 null */
async function loadProfile() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) return null
  const { data: profile, error } = await supabase
    .from('profiles').select('id, display_name, role').eq('id', user.id).maybeSingle()
  if (error) throw error
  return profile
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(DEMO
    ? { status: 'ready', profile: DEMO_PROFILE, error: null }
    : { status: 'idle', profile: null, error: null })
  const started = useRef(DEMO)

  // 第一次進入需要身份的頁面時呼叫；之後重複呼叫不會再登入一次
  const start = useCallback(() => {
    if (started.current) return
    started.current = true
    setState((s) => ({ ...s, status: 'loading' }))
    loginWithLine()
      .then((profile) => profile && setState({ status: 'ready', profile, error: null }))
      .catch((e) => setState({ status: 'error', profile: null, error: e.message }))
  }, [])

  return <AuthContext.Provider value={{ ...state, start }}>{children}</AuthContext.Provider>
}
