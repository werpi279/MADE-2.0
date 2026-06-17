import { Group } from 'three'
import { startCapture } from './capture/capture'
import { createHandLandmarker } from './tracking/handLandmarker'
import { drawHandLandmarks } from './tracking/drawLandmarks'
import { createScene } from './geometry/scene'
import { createPlaceholderMesh } from './geometry/placeholder'
import { NavSphere } from './feedback/navSphere'
import { NavigationIntent } from './intent/navigate'

const splash  = document.getElementById('splash')  as HTMLDivElement
const video   = document.getElementById('video')   as HTMLVideoElement
const sceneEl = document.getElementById('scene')   as HTMLCanvasElement
const overlay = document.getElementById('overlay') as HTMLCanvasElement
const statusEl = document.getElementById('status') as HTMLDivElement
const ctx2d   = overlay.getContext('2d')!

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
  workpiece.add(createPlaceholderMesh())

  const navSphere = new NavSphere()
  workpiece.add(navSphere.object)   // sphere follows workpiece automatically

  scene.add(workpiece)

  const navIntent = new NavigationIntent()

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
  setStatus('M2 — grab the sphere')

  let lastVideoTime = -1

  function tick(now: number): void {
    // Process new video frame
    if (capture.video.videoWidth > 0 && capture.video.currentTime !== lastVideoTime) {
      lastVideoTime = capture.video.currentTime

      const result = landmarker.detectForVideo(capture.video, now)

      // Update 2D landmark overlay
      drawHandLandmarks(ctx2d, result, overlay.width, overlay.height)

      // Update navigation intent + workpiece transform
      navIntent.update(result, workpiece, navSphere)

      const count = result.landmarks.length
      setStatus(count === 0 ? 'M2 — show your hands' : `M2 — ${count} hand${count > 1 ? 's' : ''} — grab the sphere`)
    }

    // Always render the 3D scene every frame
    renderer.render(scene, camera)

    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

main()
