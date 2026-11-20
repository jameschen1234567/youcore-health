// 身體疼痛地圖分區（草稿，分區清單待 James 確認）
// 座標系 viewBox 0 0 200 420，身體中線 x = 100。
// 正面圖：畫面左邊是客戶的「右」側；背面圖：畫面左邊是客戶的「左」側。

const SIDE_LABEL = { r: '右', l: '左' }

// 只定義畫面左半邊的四肢，右半邊鏡像產生
const LIMBS = {
  front: [
    { key: 'shoulder', label: '肩膀', shape: { type: 'circle', cx: 66, cy: 86, r: 13 } },
    { key: 'elbow', label: '上臂／手肘', shape: { type: 'rect', x: 46, y: 98, w: 16, h: 56 } },
    { key: 'wrist', label: '前臂／手腕', shape: { type: 'rect', x: 40, y: 156, w: 15, h: 70 } },
    { key: 'hip', label: '髖部／鼠蹊', shape: { type: 'rect', x: 72, y: 170, w: 27, h: 30 } },
    { key: 'thigh_front', label: '大腿前側', shape: { type: 'rect', x: 72, y: 202, w: 26, h: 70 } },
    { key: 'knee', label: '膝蓋', shape: { type: 'rect', x: 74, y: 274, w: 22, h: 24 } },
    { key: 'shin', label: '小腿前側', shape: { type: 'rect', x: 75, y: 300, w: 20, h: 66 } },
    { key: 'ankle', label: '腳踝', shape: { type: 'rect', x: 76, y: 368, w: 18, h: 14 } },
    { key: 'foot_top', label: '足背／腳趾', shape: { type: 'ellipse', cx: 82, cy: 395, rx: 14, ry: 10 } },
  ],
  back: [
    { key: 'shoulder', label: '肩膀', shape: { type: 'circle', cx: 66, cy: 86, r: 13 } },
    { key: 'elbow', label: '上臂／手肘', shape: { type: 'rect', x: 46, y: 98, w: 16, h: 56 } },
    { key: 'wrist', label: '前臂／手腕', shape: { type: 'rect', x: 40, y: 156, w: 15, h: 70 } },
    { key: 'glute', label: '臀部', shape: { type: 'rect', x: 72, y: 170, w: 27, h: 30 } },
    { key: 'thigh_back', label: '大腿後側', shape: { type: 'rect', x: 72, y: 202, w: 26, h: 70 } },
    { key: 'knee_back', label: '膝窩', shape: { type: 'rect', x: 74, y: 274, w: 22, h: 24 } },
    { key: 'calf', label: '小腿後側', shape: { type: 'rect', x: 75, y: 300, w: 20, h: 66 } },
    { key: 'heel', label: '腳跟／阿基里斯腱', shape: { type: 'rect', x: 76, y: 368, w: 18, h: 14 } },
    { key: 'sole', label: '足底', shape: { type: 'ellipse', cx: 82, cy: 395, rx: 14, ry: 10 } },
  ],
}

const CENTER = {
  front: [
    { key: 'head', label: '頭部', shape: { type: 'ellipse', cx: 100, cy: 34, rx: 20, ry: 24 } },
    { key: 'neck', label: '頸部', shape: { type: 'rect', x: 92, y: 58, w: 16, h: 14 } },
    { key: 'chest', label: '胸部', shape: { type: 'rect', x: 80, y: 76, w: 40, h: 56 } },
    { key: 'abdomen', label: '腹部', shape: { type: 'rect', x: 81, y: 134, w: 38, h: 34 } },
  ],
  back: [
    { key: 'head', label: '頭部', shape: { type: 'ellipse', cx: 100, cy: 34, rx: 20, ry: 24 } },
    { key: 'neck', label: '頸部', shape: { type: 'rect', x: 92, y: 58, w: 16, h: 14 } },
    { key: 'upper_back', label: '上背', shape: { type: 'rect', x: 80, y: 76, w: 40, h: 56 } },
    { key: 'lower_back', label: '下背', shape: { type: 'rect', x: 81, y: 134, w: 38, h: 34 } },
  ],
}

function mirror(shape) {
  if (shape.type === 'rect') return { ...shape, x: 200 - shape.x - shape.w }
  return { ...shape, cx: 200 - shape.cx }
}

function build(view) {
  // 正面：畫面左＝客戶右；背面：畫面左＝客戶左
  const [leftSide, rightSide] = view === 'front' ? ['r', 'l'] : ['l', 'r']
  const limbs = LIMBS[view].flatMap((r) => [
    { key: `${r.key}_${leftSide}`, label: `${SIDE_LABEL[leftSide]}${r.label}`, shape: r.shape },
    { key: `${r.key}_${rightSide}`, label: `${SIDE_LABEL[rightSide]}${r.label}`, shape: mirror(r.shape) },
  ])
  return [...CENTER[view], ...limbs]
}

export const BODY_VIEWS = { front: build('front'), back: build('back') }

// 所有分區（正背面共用的 key 只算一次）
export const REGION_LABELS = Object.fromEntries(
  [...BODY_VIEWS.front, ...BODY_VIEWS.back].map((r) => [r.key, r.label]),
)
