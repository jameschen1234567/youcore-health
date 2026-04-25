import { useEffect, useRef } from 'react'

// COCO-17 keypoints (YOLOv8-pose)
// 0:nose 1:L_eye 2:R_eye 3:L_ear 4:R_ear
// 5:L_shoulder 6:R_shoulder 7:L_elbow 8:R_elbow
// 9:L_wrist 10:R_wrist 11:L_hip 12:R_hip
// 13:L_knee 14:R_knee 15:L_ankle 16:R_ankle
const CONNECTIONS = [
  [0,1],[0,2],[1,3],[2,4],          // face
  [5,6],                             // shoulders
  [5,7],[7,9],                       // left arm
  [6,8],[8,10],                      // right arm
  [5,11],[6,12],[11,12],             // torso
  [11,13],[13,15],                   // left leg
  [12,14],[14,16],                   // right leg
]

// Left = blue, Right = green, centre = white
const SIDE_COLOR = {
  left:   'rgba(56,189,248,0.9)',    // cyan-blue
  right:  'rgba(52,211,153,0.9)',    // emerald-green
  centre: 'rgba(248,250,252,0.8)',
}

const CONN_SIDE = [
  'centre','centre','centre','centre',  // face
  'centre',                             // shoulders
  'left','left',                        // left arm
  'right','right',                      // right arm
  'left','right','centre',              // torso
  'left','left',                        // left leg
  'right','right',                      // right leg
]

const KEY_JOINTS = [5,6,7,8,9,10,11,12,13,14,15,16]

// ox/oy = pixel offset of video content inside the canvas (letterbox/pillarbox)
// rw/rh = rendered video content size in pixels
function drawFrame(ctx, landmarks, rw, rh, ox, oy) {
  const px = (x) => ox + x * rw
  const py = (y) => oy + y * rh

  // Connections
  CONNECTIONS.forEach(([a, b], i) => {
    const lmA = landmarks[a]
    const lmB = landmarks[b]
    if (!lmA || !lmB) return
    const conf = Math.min(lmA.conf ?? lmA.visibility ?? 0, lmB.conf ?? lmB.visibility ?? 0)
    if (conf < 0.2) return
    ctx.globalAlpha = Math.min(conf + 0.3, 1)
    ctx.strokeStyle = SIDE_COLOR[CONN_SIDE[i]]
    ctx.lineWidth   = 2.5
    ctx.beginPath()
    ctx.moveTo(px(lmA.x), py(lmA.y))
    ctx.lineTo(px(lmB.x), py(lmB.y))
    ctx.stroke()
  })
  ctx.globalAlpha = 1

  // Joint circles
  KEY_JOINTS.forEach(idx => {
    const lm = landmarks[idx]
    if (!lm) return
    const conf = lm.conf ?? lm.visibility ?? 0
    if (conf < 0.25) return
    const isLeft  = [5,7,9,11,13,15].includes(idx)
    ctx.fillStyle = isLeft ? SIDE_COLOR.left : SIDE_COLOR.right
    ctx.globalAlpha = Math.min(conf + 0.2, 1)
    ctx.beginPath()
    ctx.arc(px(lm.x), py(lm.y), 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.arc(px(lm.x), py(lm.y), 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  })
}

/**
 * Calculate where the video content actually appears inside the canvas,
 * accounting for object-fit:contain letterboxing / pillarboxing.
 *
 * We use `dataW/dataH` (backend's orientation-corrected dimensions) rather
 * than `video.videoWidth/videoHeight` because browsers behave inconsistently
 * regarding rotation metadata — some return raw pixel dimensions, others
 * return the post-rotation display dimensions.
 */
function getVideoRect(dataW, dataH, canvasW, canvasH) {
  // Fallback to canvas dimensions if data not available
  const vw = dataW || canvasW
  const vh = dataH || canvasH
  const videoAspect     = vw / vh
  const containerAspect = canvasW / canvasH

  let rw, rh, ox, oy
  if (videoAspect > containerAspect) {
    // wider than container → bars top & bottom
    rw = canvasW
    rh = canvasW / videoAspect
    ox = 0
    oy = (canvasH - rh) / 2
  } else {
    // taller than container → bars left & right
    rh = canvasH
    rw = canvasH * videoAspect
    ox = (canvasW - rw) / 2
    oy = 0
  }
  return { rw, rh, ox, oy }
}

export default function SkeletonCanvas({ videoUrl, data, videoRef, onTimeUpdate }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !data) return

    const ctx = canvas.getContext('2d')

    const render = () => {
      const fps      = data.fps || 30
      const frameIdx = Math.min(
        Math.round(video.currentTime * fps),
        data.frames.length - 1
      )
      const frame = data.frames[frameIdx]

      // Canvas resolution = container's CSS display size (device pixels)
      const dpr = window.devicePixelRatio || 1
      const displayW = canvas.offsetWidth
      const displayH = canvas.offsetHeight
      if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
        canvas.width  = displayW * dpr
        canvas.height = displayH * dpr
        ctx.scale(dpr, dpr)
      }

      ctx.clearRect(0, 0, displayW, displayH)

      if (frame?.landmarks) {
        // Use backend's orientation-corrected dimensions for correct aspect ratio
        const { rw, rh, ox, oy } = getVideoRect(
          data.width, data.height, displayW, displayH
        )
        drawFrame(ctx, frame.landmarks, rw, rh, ox, oy)
      }

      rafRef.current = requestAnimationFrame(render)
    }

    const startRaf = () => { rafRef.current = requestAnimationFrame(render) }
    const stopRaf  = () => cancelAnimationFrame(rafRef.current)

    video.addEventListener('play',   startRaf)
    video.addEventListener('pause',  stopRaf)
    video.addEventListener('ended',  stopRaf)
    video.addEventListener('seeked', render)   // draw on scrub

    // Draw first frame immediately
    video.addEventListener('loadeddata', render, { once: true })

    return () => {
      stopRaf()
      video.removeEventListener('play',   startRaf)
      video.removeEventListener('pause',  stopRaf)
      video.removeEventListener('ended',  stopRaf)
      video.removeEventListener('seeked', render)
    }
  }, [data, videoRef])

  return (
    <>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onTimeUpdate={onTimeUpdate}
      />
      <canvas ref={canvasRef} />
    </>
  )
}
