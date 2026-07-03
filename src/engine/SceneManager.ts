/* ============================================================
   SceneManager — owns the Three.js world: renderer, camera,
   orbit controls, light rig, environment, ground shadow catcher,
   grid, and the single icon mesh. Completely UI-free; React
   components talk to it through this imperative API and the
   store subscription wired up in App.

   Playback: the rAF loop advances store.time while playing and
   re-applies evaluatePose() every frame, so scrubbing the
   timeline and playing use the exact same code path as export.
   ============================================================ */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type {
  AnimationSettings,
  BackgroundSettings,
  CameraState,
  LightingSettings,
  MaterialSettings,
} from '../types'
import { evaluatePose } from './animation'
import { applyMaterialSettings, createIconMaterial } from './materials'
import { applyLightingSettings, createLightRig, type LightRig } from './lights'
import { resolveBackground } from './background'

const DEFAULT_FOV = 35

export class SceneManager {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.05, 100)
  renderer!: THREE.WebGLRenderer
  controls!: OrbitControls

  /** pivot carries the animation pose; mesh carries user scale */
  private pivot = new THREE.Group()
  private mesh: THREE.Mesh
  private material = createIconMaterial()
  private rig: LightRig
  private ground: THREE.Mesh
  private grid: THREE.GridHelper
  private envTexture: THREE.Texture | null = null
  private raf = 0
  private lastTick = 0
  private container: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null

  /** callbacks the app wires up */
  onFrame: ((dt: number) => void) | null = null

  gridVisible = false
  private userScale = 1
  private meshBaseRadius = 1

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = false
    this.pivot.add(this.mesh)
    this.scene.add(this.pivot)

    this.rig = createLightRig()
    this.scene.add(this.rig.group)

    // shadow catcher — invisible plane that only shows the shadow
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.32 })
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), shadowMat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = -1.7
    this.ground.receiveShadow = true
    this.scene.add(this.ground)

    this.grid = new THREE.GridHelper(12, 24, 0x2c5566, 0x1d3a46)
    this.grid.position.y = -1.701
    this.grid.visible = false
    this.scene.add(this.grid)
  }

  mount(container: HTMLElement): void {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    // image-based lighting from the procedural RoomEnvironment — free, local
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envTexture

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    if (this.camera.position.lengthSq() < 1e-6) this.resetCamera()
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 0.6
    this.controls.maxDistance = 30
    this.controls.autoRotateSpeed = 1.6

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()

    this.lastTick = performance.now()
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop)
      const dt = Math.min((now - this.lastTick) / 1000, 0.25)
      this.lastTick = now
      this.onFrame?.(dt)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    this.raf = requestAnimationFrame(loop)
  }

  unmount(): void {
    cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    this.controls?.dispose()
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.envTexture?.dispose()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
  }

  private resize(): void {
    if (!this.container || !this.renderer) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /* ---------------- geometry ---------------- */

  /** Swap in a new icon geometry. Caller (cache) owns disposal. */
  setGeometry(geometry: THREE.BufferGeometry): void {
    this.mesh.geometry = geometry
    this.meshBaseRadius = geometry.boundingSphere?.radius ?? 1
    this.updateGroundPosition()
  }

  setUserScale(scale: number): void {
    this.userScale = scale
    this.updateGroundPosition()
  }

  private updateGroundPosition(): void {
    const bbox = this.mesh.geometry.boundingBox
    // keep the floor just below the largest possible swing of the object
    const r = bbox ? Math.max(-bbox.min.y, bbox.max.y, -bbox.min.z, bbox.max.z) : 1.4
    const y = -(r * this.userScale + 0.42)
    this.ground.position.y = y
    this.grid.position.y = y - 0.001
  }

  /* ---------------- settings appliers (no geometry rebuild) ---------------- */

  applyMaterial(m: MaterialSettings): void {
    applyMaterialSettings(this.material, m)
  }

  applyLighting(l: LightingSettings): void {
    applyLightingSettings(this.rig, l)
    this.ground.visible = l.shadows
  }

  applyBackground(b: BackgroundSettings): void {
    const resolved = resolveBackground(b)
    this.scene.background = resolved.texture ?? resolved.clearColor
  }

  setGrid(visible: boolean): void {
    this.gridVisible = visible
    this.grid.visible = visible
  }

  setAutoRotate(on: boolean): void {
    if (this.controls) this.controls.autoRotate = on
  }

  /* ---------------- animation pose ---------------- */

  applyPose(anim: AnimationSettings, time: number): void {
    const pose = evaluatePose(anim, time)
    this.pivot.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z)
    this.pivot.position.set(pose.position.x, pose.position.y, pose.position.z)
    const s = pose.scale * this.userScale
    this.mesh.scale.setScalar(s)
  }

  /* ---------------- camera ---------------- */

  getCameraState(): CameraState {
    return {
      position: this.camera.position.toArray() as [number, number, number],
      target: this.controls ? (this.controls.target.toArray() as [number, number, number]) : [0, 0, 0],
      autoRotate: this.controls?.autoRotate ?? false,
    }
  }

  setCameraState(state: CameraState): void {
    this.camera.position.set(...state.position)
    if (this.controls) {
      this.controls.target.set(...state.target)
      this.controls.autoRotate = state.autoRotate
      this.controls.update()
    }
  }

  resetCamera(): void {
    this.setCameraState({ position: [1.4, 1.1, 3.9], target: [0, 0, 0], autoRotate: this.controls?.autoRotate ?? false })
  }

  /** Frame the object: keep view direction, adjust distance to fit. */
  fitCamera(): void {
    const radius = Math.max(this.meshBaseRadius * this.userScale, 0.001)
    const fov = THREE.MathUtils.degToRad(this.camera.fov)
    const distance = (radius / Math.tan(fov / 2)) * 1.25
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    if (dir.lengthSq() < 1e-9) dir.set(0, 0.25, 1).normalize()
    this.controls.target.set(0, 0, 0)
    this.camera.position.copy(dir.multiplyScalar(distance))
    this.controls.update()
  }

  /* ---------------- export support ---------------- */

  /** exclude viewport-only helpers while an export renderer draws the scene */
  beginExternalRender(): () => void {
    const gridWas = this.grid.visible
    this.grid.visible = false
    return () => {
      this.grid.visible = gridWas
    }
  }
}

/** module-level singleton — the app has exactly one 3D world */
export const sceneManager = new SceneManager()
