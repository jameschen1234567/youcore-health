// 量腳與量鞋墊的圖解
const G = '#4A6741', A = '#C9A96E', K = '#1C2B1A'
const FOOT = 'M0 0 C-19 0 -22 -24 -20 -46 C-18 -68 -30 -84 -30 -106 C-30 -132 -20 -150 -8 -154 C4 -158 14 -146 20 -134 C28 -118 32 -100 26 -80 C20 -60 22 -46 21 -30 C20 -10 14 0 0 0 Z'

export function FootGuide() {
  return (
    <section className="card foot-guide">
      <svg viewBox="0 0 260 230" role="img" aria-label="A4 紙靠牆，腳跟貼牆站上去，標出最長腳趾、前掌兩側最寬處、腳跟兩側最寬處">
        <rect x="20" y="206" width="220" height="10" fill={K} />
        <text x="130" y="227" textAnchor="middle" fontSize="11" fill={K}>牆</text>
        <rect x="70" y="26" width="120" height="180" fill="#fff" stroke="#bbb" />
        <path d={FOOT} transform="translate(130 206)" fill="#E9D3C3" stroke={K} strokeWidth="1.2" />
        <g stroke={A} strokeWidth="2.5" fill="none">
          <path d="M212 206 V52 M206 206 h12 M206 52 h12" />
          <path d="M100 100 H162 M100 94 v12 M162 94 v12" />
          <path d="M110 178 H151 M110 172 v12 M151 172 v12" />
        </g>
        <g fontSize="12" fontWeight="700" fill={G}>
          <text x="219" y="132">足長</text>
          <text x="131" y="93" textAnchor="middle">前掌寬</text>
          <text x="131" y="171" textAnchor="middle">腳跟寬</text>
        </g>
      </svg>
      <ol className="steps">
        <li><b>A4 紙的短邊貼著牆</b>，放在硬地板上，用膠帶固定</li>
        <li><b>赤腳站上去，腳跟輕碰牆</b>，兩腳平均站、看前方</li>
        <li><b>筆拿直</b>，標出：最長的腳趾尖、前掌兩側最寬處、腳跟兩側最寬處。請家人幫忙標會更準</li>
        <li><b>腳離開紙，用尺量</b>三個距離。足長是從紙貼牆的那一邊，直直量到腳趾記號</li>
      </ol>
      <p className="muted small">左右腳各量一次。腳長超過 A4 紙（29.7 公分），前面再接一張紙。</p>
    </section>
  )
}

export function InsoleGuide() {
  return (
    <section className="card foot-guide">
      <svg viewBox="0 0 320 130" role="img" aria-label="鞋墊平放，從腳跟沿中線標出不同距離，量每個位置左右兩側的寬度">
        <path d="M20 65 C20 40 40 38 66 40 C120 44 150 34 200 24 C250 16 296 34 300 62 C302 88 270 104 226 104 C176 104 130 92 70 92 C40 92 20 90 20 65 Z" fill="#fff" stroke={K} strokeWidth="1.5" />
        <path d="M20 65 H300" stroke="#999" strokeDasharray="4 4" />
        <g stroke={A} strokeWidth="2.5">
          <path d="M45 40 V91" /><path d="M101 42 V95" /><path d="M154 34 V101" /><path d="M205 23 V104" /><path d="M250 22 V101" /><path d="M278 32 V91" />
        </g>
        <text x="20" y="122" fontSize="12" fontWeight="700" fill={G}>腳跟</text>
        <text x="300" y="122" fontSize="12" fontWeight="700" fill={G} textAnchor="end">腳尖</text>
        <text x="160" y="15" fontSize="12" fontWeight="700" fill={G} textAnchor="middle">量每條線左右兩側的寬度</text>
      </svg>
      <ol className="steps">
        <li><b>把鞋墊從鞋子拿出來</b>，平放在桌上</li>
        <li><b>量長度</b>：腳跟最後面到腳尖最前面</li>
        <li>填完長度後，下面會出現要量的位置；<b>在鞋墊上做記號，量左右兩側的寬度</b></li>
      </ol>
      <p className="muted small">鞋墊黏住拿不出來、或邊緣有高起的側牆不好量，請直接帶鞋子來店裡量。</p>
    </section>
  )
}
