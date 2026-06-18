import { Group } from 'three'
import { startCapture } from './capture/capture'
import { createHandLandmarker } from './tracking/handLandmarker'
import { drawHandLandmarks } from './tracking/drawLandmarks'
import { createScene } from './geometry/scene'
import { createPlaceholderMesh } from './geometry/placeholder'
import { SculptEngine } from './geometry/sculpt'
import { NavSphere } from './feedback/navSphere'
import { InfluenceBlob } from './feedback/influenceBlob'
import { NavigationIntent } from './intent/navigate'
import { CreateIntent } from './intent/create'
import { SculptIntent } from './intent/sculpt'

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

  const workpiece = new Group()

  const clayMesh = createPlaceholderMesh()
  workpiece.add(clayMesh)

  const navSphere = new NavSphere()
  workpiece.add(navSphere.object)

  const blob = new InfluenceBlob()
  workpiece.add(blob.object)      // blob in workpiece local space

  scene.add(workpiece)

  // Camera and model load first — nothing should block permission request
  const createIntent = new CreateIntent(workpiece)
  const navIntent    = new NavigationIntent()

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

  // ── Sculpt engine (needs camera+model first to guarantee we got this far) ──
  const sculptEngine = new SculptEngine(clayMesh)
  const sculptIntent = new SculptIntent(sculptEngine, blob)

  splash.classList.add('hidden')
  setStatus('M4 — point to draw · pinch surface to sculpt · grab sphere to navigate')

  let lastVideoTime = -1

  function tick(now: number): void {
    if (capture.video.videoWidth > 0 && capture.video.currentTime !== lastVideoTime) {
      lastVideoTime = capture.video.currentTime

      const result = landmarker.detectForVideo(capture.video, now)
      drawHandLandmarks(ctx2d, result, overlay.width, overlay.height)

      // Priority: SCULPT > CREATE > NAVIGATE.
      // SculptIntent returns the hand indices it consumed so Navigate can skip them.
      const sculpted = sculptIntent.update(result, workpiece)
      createIntent.update(result)
      navIntent.update(result, workpiece, navSphere, sculpted)

      const count = result.landmarks.length
      setStatus(
        count === 0
          ? 'M4 — show your hands'
          : sculpted.size
            ? 'M4 — sculpting'
            : createIntent.isDrawing
              ? 'M4 — drawing'
              : 'M4 — point · pinch surface · grab sphere',
      )
    }

    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

main()
