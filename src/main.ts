import { Group } from 'three'
import { startCapture } from './capture/capture'
import { createHandLandmarker } from './tracking/handLandmarker'
import { drawHandLandmarks } from './tracking/drawLandmarks'
import { createScene } from './geometry/scene'
import { createPlaceholderMesh } from './geometry/placeholder'
import { NavSphere } from './feedback/navSphere'
import { NavigationIntent } from './intent/navigate'
import { CreateIntent } from './intent/create'

const splash   = document.getElementById('splash')  as HTMLDivElement
const video    = document.getElementById('video')   as HTMLVideoElement
const sceneEl  = document.getElementById('scene')   as HTMLCanvasElement
const overlay  = document.getElementById('overlay') as HTMLCanvasElement
const statusEl = document.getElementById('status')  as HTMLDivElement
const ctx2d    = overlay.getContext('2d')!

function setStatus(msg: string): void { statusEl.textContent = msg }

function resizeOverlay(): void {
  overlay.width  = window.innerWidth
  overlay.height = window.innerHeight
}

async function main(): Promise<void> {
  resizeOverlay()
  window.addEventListener('resize', resizeOverlay)

  // ── Three.js scene ──────────────────────────────────────────────────────
  const { renderer, scene, camera } = createScene(sceneEl)

  // The workpiece Group holds all clay geometry + the nav sphere.
  // Everything inside moves together when the user navigates.
  const workpiece = new Group()
  workpiece.add(createPlaceholderMesh())

  const navSphere = new NavSphere()
  workpiece.add(navSphere.object)

  scene.add(workpiece)

  const navIntent    = new NavigationIntent()
  const createIntent = new CreateIntent(workpiece)

  // ── Camera + hand tracking ──────────────────────────────────────────────
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

  splash.classList.add('hidden')
  setStatus('M3 — point to draw · grab sphere to navigate')

  let lastVideoTime = -1

  function tick(now: number): void {
    if (capture.video.videoWidth > 0 && capture.video.currentTime !== lastVideoTime) {
      lastVideoTime = capture.video.currentTime

      const result = landmarker.detectForVideo(capture.video, now)

      drawHandLandmarks(ctx2d, result, overlay.width, overlay.height)

      // CREATE runs first — it checks its own eligibility (pointing + far from sphere)
      createIntent.update(result)

      // NAVIGATE runs for all hands (it checks proximity to sphere internally)
      navIntent.update(result, workpiece, navSphere)

      const count = result.landmarks.length
      const drawing = createIntent.isDrawing
      const msg = count === 0
        ? 'M3 — show your hands'
        : drawing
          ? 'M3 — drawing…'
          : 'M3 — point to draw · grab sphere to navigate'
      setStatus(msg)
    }

    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

main()
