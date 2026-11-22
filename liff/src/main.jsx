import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 深層連結：圖文選單用 https://liff.line.me/{LIFF_ID}/training 這種網址，
// LIFF 會轉到 /training；本 App 用 HashRouter，所以把路徑換成 #/training。
const { pathname, search, hash } = window.location
if (pathname !== '/' && pathname !== '/index.html' && !hash.startsWith('#/')) {
  window.history.replaceState(null, '', `/${search}#${pathname}`)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
