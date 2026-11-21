// 登入流程：LIFF 初始化 → 取得 LINE ID token → line-auth 驗證 → Supabase session
// Demo 模式直接給一個假身份。
import { createContext, useContext, useEffect, useState } from 'react'
import liff from '@line/liff'
import { DEMO, DEMO_ROLE, LIFF_ID } from '../config'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const DEMO_PROFILE = { id: 'demo-user', display_name: '體驗用戶', role: DEMO_ROLE }

async function loginWithLine() {
  await liff.init({ liffId: LIFF_ID })
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href })
    return null // 會跳轉到 LINE 登入頁
  }

  // 已有有效 session 就直接用，不必每次重新驗證
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const idToken = liff.getIDToken()
    if (!idToken) throw new Error('無法取得 LINE 身份，請重新開啟頁面')
    const { data, error } = await supabase.functions.invoke('line-auth', { body: { idToken } })
    if (error || !data?.tokenHash) throw new Error('LINE 登入驗證失敗')
    const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' })
    if (otpErr) throw otpErr
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile, error } = await supabase
    .from('profiles').select('id, display_name, role').eq('id', user.id).single()
  if (error) throw error
  return profile
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', profile: null, error: null })

  useEffect(() => {
    if (DEMO) {
      setState({ status: 'ready', profile: DEMO_PROFILE, error: null })
      return
    }
    loginWithLine()
      .then((profile) => profile && setState({ status: 'ready', profile, error: null }))
      .catch((e) => setState({ status: 'error', profile: null, error: e.message }))
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
