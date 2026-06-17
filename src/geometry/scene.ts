import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
} from 'three'

export interface SceneSetup {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
}

export function createScene(canvas: HTMLCanvasElement): SceneSetup {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()

  const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5)

  scene.add(new HemisphereLight(0x8899bb, 0x443322, 0.6))
  const sun = new DirectionalLight(0xffffff, 1.2)
  sun.position.set(3, 5, 4)
  scene.add(sun)
  scene.add(new AmbientLight(0xffffff, 0.2))

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { renderer, scene, camera }
}
