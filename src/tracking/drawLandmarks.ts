import type { HandLandmarkerResult } from './handLandmarker'

// MediaPipe hand skeleton connections
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [0, 9], [9, 10], [10, 11], [11, 12],  // middle
  [0, 13], [13, 14], [14, 15], [15, 16],// ring
  [0, 17], [17, 18], [18, 19], [19, 20],// pinky
  [5, 9], [9, 13], [13, 17],            // palm knuckles
]

const HAND_COLORS = ['#a0c4ff', '#ffd6a5'] // left / right (or hand 0 / hand 1)
const FINGERTIP_INDICES = new Set([4, 8, 12, 16, 20])

export function drawHandLandmarks(
  ctx: CanvasRenderingContext2D,
  result: HandLandmarkerResult,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height)

  for (let h = 0; h < result.landmarks.length; h++) {
    const lm = result.landmarks[h]
    const color = HAND_COLORS[h % HAND_COLORS.length]

    // Skeleton lines
    ctx.strokeStyle = color + '99'
    ctx.lineWidth = 2
    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath()
      // canvas is mirrored via CSS; landmark x is already in mirrored space
      ctx.moveTo(lm[a].x * width, lm[a].y * height)
      ctx.lineTo(lm[b].x * width, lm[b].y * height)
      ctx.stroke()
    }

    // Landmark dots
    for (let i = 0; i < lm.length; i++) {
      const x = lm[i].x * width
      const y = lm[i].y * height
      const r = FINGERTIP_INDICES.has(i) ? 6 : 3

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = FINGERTIP_INDICES.has(i) ? color : color + 'bb'
      ctx.fill()
    }
  }
}
