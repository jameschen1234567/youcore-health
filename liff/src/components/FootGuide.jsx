// 拍照教學：圖解＋三個重點
export default function FootGuide() {
  return (
    <section className="card foot-guide">
      <svg viewBox="0 0 240 200" role="img" aria-label="拍照示意：A4 紙平放在深色地板，腳踩在紙中間，手機從正上方往下拍">
        <rect x="0" y="0" width="240" height="200" rx="12" fill="#3B3F45" />
        <rect x="70" y="28" width="100" height="142" rx="2" fill="#FFFFFF" />
        {/* 腳（腳跟在下） */}
        <ellipse cx="120" cy="120" rx="17" ry="30" fill="#E0B49A" />
        <ellipse cx="120" cy="78" rx="26" ry="32" fill="#E0B49A" />
        {/* 四角標示 */}
        {[[70, 28], [170, 28], [170, 170], [70, 170]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="none" stroke="#C9A96E" strokeWidth="2.5" />
        ))}
        <text x="120" y="190" textAnchor="middle" fontSize="11" fill="#F4F0E8">四個角都要入鏡</text>
        {/* 手機 */}
        <g transform="translate(192 34)">
          <rect width="30" height="50" rx="5" fill="#1C2B1A" stroke="#C9A96E" strokeWidth="2" />
          <circle cx="15" cy="10" r="4" fill="#C9A96E" />
        </g>
        <path d="M207 90 v28" stroke="#C9A96E" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#arr)" />
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#C9A96E" />
          </marker>
        </defs>
      </svg>
      <ol className="steps">
        <li><b>A4 紙平放在深色地板</b>（白色磁磚或淺色地毯會量不準）</li>
        <li><b>赤腳或穿薄襪，站著踩上去</b>，腳放在紙的正中間、和紙的長邊平行，體重平均放在兩腳</li>
        <li><b>請家人從腳的正上方往下拍</b>，手機與地板平行，紙的四個角都要拍進去</li>
      </ol>
      <p className="muted small">左右腳各拍一張，大約 3 分鐘。腳長超過約 28 cm 請改用 A3 紙。</p>
    </section>
  )
}
