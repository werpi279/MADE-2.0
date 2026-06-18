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
import { BubbleIntent } from './intent/bubble'
import type { HandLandmarkerResult } from './tracking/handLandmarker'

const splash    = document.getElementById('splash')     as HTMLDivElement
const video     = document.getElementById('video')      as HTMLVideoElement
const sceneEl   = document.getElementById('scene')      as HTMLCanvasElement
const overlay   = document.getElementById('overlay')    as HTMLCanvasElement
const statusEl  = document.getElementById('status')     as HTMLDivElement
const resetBtn  = document.getElementById('reset-btn')  as HTMLButtonElement
const ctx2d     = overlay.getContext('2d')!

function setStatus(msg: string): void { statusEl.textContent = msg }

/**
 * Classify each detected hand as the user's physical left or right hand.
 * In a selfie-camera setup the user's left hand appears on the right side of the
 * camera image (lm[9].x > 0.5 in normalised coords), so we use that as the split.
 * Returns [leftHandIndices, rightHandIndices].
 */
function classifyHands(result: HandLandmarkerResult): [Set<number>, Set<number>] {
  const left = new Set<number>()
  const right = new Set<number>()
  result.landmarks.forEach((lm, h) => {
    // Middle MCP (lm[9]) is a stable landmark at the back of the hand.
    // x > 0.5 in camera image = user's left hand (selfie mirror).
    if (lm[9].x > 0.5) left.add(h)
    else right.add(h)
  })
  return [left, right]
}

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

  resetBtn.addEventListener('click', () => {
    workpiece.position.set(0, 0, 0)
    workpiece.rotation.set(0, 0, 0)
    workpiece.scale.set(1, 1, 1)
  })

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

  // ── Sculpt + bubble engines (needs camera+model first) ──────────────────────
  const sculptEngine = new SculptEngine(clayMesh)
  const sculptIntent = new SculptIntent(sculptEngine, blob)
  const bubbleIntent = new BubbleIntent(sculptEngine, workpiece)

  splash.classList.add('hidden')
  setStatus('M4 — point to draw · pinch surface to sculpt · grab sphere to navigate')

  let lastVideoTime = -1

  function tick(now: number): void {
    if (capture.video.videoWidth > 0 && capture.video.currentTime !== lastVideoTime) {
      lastVideoTime = capture.video.currentTime

      const result = landmarker.detectForVideo(capture.video, now)
      drawHandLandmarks(ctx2d, result, overlay.width, overlay.height)

      // Classify hands: left (user's physical left) → navigation only
      //                  right (user's physical right) → modelling only
      const [leftHands, rightHands] = classifyHands(result)

      // Priority within modelling (right hand): BUBBLE_CAGE > SCULPT(mask) > CREATE
      const bubbleClaimed = bubbleIntent.update(result, leftHands)
      const sculpted = sculptIntent.update(
        result, workpiece,
        bubbleIntent.getVertexWeights(),
        new Set([...leftHands, ...bubbleClaimed]),
      )
      const allModelClaimed = new Set([...bubbleClaimed, ...sculpted])
      createIntent.update(result, new Set([...leftHands, ...allModelClaimed]))

      // Navigation: left hand only — skip right hands and any claimed modelling hands
      navIntent.update(result, workpiece, navSphere, new Set([...rightHands, ...allModelClaimed]))

      const count = result.landmarks.length
      setStatus(
        count === 0
          ? 'show both hands · left = navigate · right = sculpt/draw'
          : bubbleIntent.isActive
            ? 'bubble · ✌ resize · pinch shell = move · poke to dismiss'
            : sculpted.size
              ? 'sculpting'
              : createIntent.isDrawing
                ? 'drawing'
                : '☝ draw coil · ✌ loop bubble · pinch surface · left hand = sphere',
      )
    }

    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

main()
