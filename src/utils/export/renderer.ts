/* ============================================================
   Export renderer — a second, offscreen WebGLRenderer at the
   exact export resolution. Three.js keeps per-renderer GPU state,
   so it can draw the live scene without touching the viewport.

   The only non-shareable resource is the PMREM environment (it is
   a render target texture bound to the viewport's GL context), so
   the export renderer builds its own and swaps it in around each
   render call. Background textures are canvas-backed and shared.
   ============================================================ */

import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { sceneManager } from '../../engine/SceneManager'
import { resolveBackground } from '../../engine/background'
import type { AnimationSettings, BackgroundSettings } from '../../types'

export class ExportRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.PerspectiveCamera
  readonly width: number
  readonly height: number
  private env: THREE.Texture

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // required: frames are read back (toBlob / VideoFrame) after render
      preserveDrawingBuffer: true,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()

    this.camera = new THREE.PerspectiveCamera()
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }

  /**
   * Render one frame of the live scene at export resolution.
   * Pose + background are set explicitly so frames are deterministic.
   */
  renderFrame(background: BackgroundSettings, anim: AnimationSettings, time: number): void {
    const scene = sceneManager.scene
    const restoreHelpers = sceneManager.beginExternalRender()

    const prevEnv = scene.environment
    const prevBg = scene.background
    scene.environment = this.env

    const resolved = resolveBackground(background)
    scene.background = resolved.texture ?? resolved.clearColor

    sceneManager.applyPose(anim, time)

    this.camera.copy(sceneManager.camera)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()

    this.renderer.render(scene, this.camera)

    scene.environment = prevEnv
    scene.background = prevBg
    restoreHelpers()
  }

  toBlob(type: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas capture failed.'))),
        type,
        quality,
      )
    })
  }

  /** RGBA pixel read for the GIF encoder (alpha preserved). */
  readPixels(): ImageData {
    const c = document.createElement('canvas')
    c.width = this.width
    c.height = this.height
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(this.canvas, 0, 0)
    return ctx.getImageData(0, 0, this.width, this.height)
  }

  dispose(): void {
    this.env.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
