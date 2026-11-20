// 量表清單。新增量表：在這個資料夾加一個設定檔，再加進下面的物件即可。
import { DEMO } from '../config'
import ffiTc from './ffi-tc'
import nrs from './nrs'

export const QUESTIONNAIRES = {
  [ffiTc.key]: ffiTc,
  [nrs.key]: nrs,
}

/** 客戶看得到的量表：佔位量表只在 Demo 模式出現 */
export function visibleQuestionnaires() {
  return Object.values(QUESTIONNAIRES).filter((q) => DEMO || !q.placeholder)
}
