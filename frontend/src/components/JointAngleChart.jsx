import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const COLORS = [
  '#3b82f6','#10b981','#f59e0b','#f43f5e',
  '#8b5cf6','#06b6d4','#ec4899','#84cc16',
  '#fb923c','#a78bfa',
]

const MAX_POINTS = 500

// ── subsamplers ────────────────────────────────────────────────

function subsample(frames, joint_angles, activeJoints) {
  const n    = frames.length
  const step = Math.max(1, Math.floor(n / MAX_POINTS))
  const out  = []
  for (let i = 0; i < n; i += step) {
    const pt = { time: frames[i].timestamp }
    for (const j of activeJoints) {
      const v = joint_angles[j]?.[i]
      pt[j] = v !== null && v !== undefined ? v : undefined
    }
    out.push(pt)
  }
  return out
}

function subsampleComDisp(frames, com) {
  const n    = frames.length
  const step = Math.max(1, Math.floor(n / MAX_POINTS))
  const out  = []
  for (let i = 0; i < n; i += step) {
    out.push({
      time:  frames[i].timestamp,
      com_x: com?.x?.[i] ?? undefined,
      com_y: com?.y?.[i] ?? undefined,
    })
  }
  return out
}

function subsampleComVel(frames, kin) {
  const n    = frames.length
  const step = Math.max(1, Math.floor(n / MAX_POINTS))
  const out  = []
  for (let i = 0; i < n; i += step) {
    out.push({
      time:  frames[i].timestamp,
      vel_x: kin?.vel_x?.[i] ?? undefined,
      vel_y: kin?.vel_y?.[i] ?? undefined,
    })
  }
  return out
}

function subsampleComAcc(frames, kin) {
  const n    = frames.length
  const step = Math.max(1, Math.floor(n / MAX_POINTS))
  const out  = []
  for (let i = 0; i < n; i += step) {
    out.push({
      time:  frames[i].timestamp,
      acc_x: kin?.acc_x?.[i] ?? undefined,
      acc_y: kin?.acc_y?.[i] ?? undefined,
    })
  }
  return out
}

// ── COM line definitions per mode ──────────────────────────────

const COM_LINES = {
  displacement: [
    { key: 'com_x', label: 'COM 水平位移 X', color: '#3b82f6', unit: ' (norm)' },
    { key: 'com_y', label: 'COM 垂直位移 Y', color: '#f43f5e', unit: ' (norm)' },
  ],
  velocity: [
    { key: 'vel_x', label: 'COM 水平速度 Vx', color: '#3b82f6', unit: ' norm/s' },
    { key: 'vel_y', label: 'COM 垂直速度 Vy', color: '#f43f5e', unit: ' norm/s' },
  ],
  acceleration: [
    { key: 'acc_x', label: 'COM 水平加速度 Ax', color: '#10b981', unit: ' norm/s²' },
    { key: 'acc_y', label: 'COM 垂直加速度 Ay', color: '#f59e0b', unit: ' norm/s²' },
  ],
}

// ── Tooltip ────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 6, padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{label?.toFixed(2)} s</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value?.toFixed(3)}{p.unit}
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────

export default function JointAngleChart({
  data, activeJoints, currentTime, onSeek,
  showCom = false, comMode = 'velocity',
}) {
  const chartData = useMemo(() => {
    if (!data) return []
    if (showCom) {
      if (comMode === 'displacement') return subsampleComDisp(data.frames, data.com)
      if (comMode === 'acceleration') return subsampleComAcc(data.frames, data.com_kinematics)
      return subsampleComVel(data.frames, data.com_kinematics)
    }
    return subsample(data.frames, data.joint_angles, activeJoints)
  }, [data, activeJoints, showCom, comMode])

  const handleClick = (e) => {
    if (e?.activePayload?.[0]?.payload?.time !== undefined) {
      onSeek(e.activePayload[0].payload.time)
    }
  }

  if (!chartData.length) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40, fontSize: 13 }}>
        {showCom ? '無法計算 COM 資料' : '請選擇要顯示的關節'}
      </div>
    )
  }

  const lines = showCom
    ? (COM_LINES[comMode] || COM_LINES.velocity)
    : activeJoints.map((j, i) => ({
        key: j,
        label: j.replace(/_/g, ' '),
        color: COLORS[i % COLORS.length],
        unit: '°',
      }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} onClick={handleClick} style={{ cursor: 'crosshair' }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
        <XAxis
          dataKey="time"
          tickFormatter={v => `${v.toFixed(1)}s`}
          tick={{ fill: '#64748b', fontSize: 11 }}
          stroke="#334155"
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          stroke="#334155"
          width={44}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          formatter={v => v}
        />
        <ReferenceLine x={parseFloat(currentTime.toFixed(2))} stroke="#f43f5e" strokeDasharray="4 2" />
        {lines.map(l => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            stroke={l.color}
            dot={false}
            strokeWidth={2}
            connectNulls={false}
            name={l.label}
            unit={l.unit}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
