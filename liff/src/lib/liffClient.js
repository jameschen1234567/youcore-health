// LIFF 只初始化一次（登入流程與分享按鈕共用）
import liff from '@line/liff'
import { LIFF_ID } from '../config'

let ready = null
export function liffReady() {
  if (!ready) ready = liff.init({ liffId: LIFF_ID }).then(() => liff)
  return ready
}
