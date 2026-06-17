import { startCapture } from './capture/capture'
import { createHandLandmarker } from './tracking/handLandmarker'
import { drawHandLandmarks } from './tracking/drawLandmarks'

const splash = document.getElementById('splash') as HTMLDivElement
const video   = document.getElementById('video')   as HTMLVideoElement
const canvas  = document.getElementById('overlay') as HTMLCanvasElement
const status  = document.getElementById('status')  as HTMLDivElement
const ctx     = canvas.getContext('2d')!

function setStatus(msg: string): void {
  status.textContent = msg
}

function resizeCanvas(): void {
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
}

async function main(): Promise<void> {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  setStatus('requesting camera…')
  const capture = await startCapture(video).catch((err: Error) => {
    setStatus(`camera error: ${err.message}`)
    throw err
  })

  setStatus('loading hand tracking model…')
  const landmarker = await createHandLandmarker().catch((err: Error) => {
    setStatus(`model load error: ${err.message}`)
    throw err
  })

  // Hide splash once camera + model are both ready
  splash.classList.add('hidden')
  setStatus('M1 — hand tracking active')

  let lastVideoTime = -1

  function tick(): void {
    const now = performance.now()

    if (capture.video.videoWidth > 0 && capture.video.currentTime !== lastVideoTime) {
      lastVideoTime = capture.video.currentTime

      const result = landmarker.detectForVideo(capture.video, now)
      drawHandLandmarks(ctx, result, canvas.width, canvas.height)

      const count = result.landmarks.length
      setStatus(count === 0 ? 'M1 — show your hands' : `M1 — ${count} hand${count > 1 ? 's' : ''} detected`)
    }

    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

main()
