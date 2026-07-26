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
import { applyBackgroundCover, backgroundIsImage, resolveBackground } from './background'
import { getActiveEnvironment, setCustomEnvironment, setEnvironmentChangedListener } from './environment'
import { BASE_FOV, viewportFov } from './frame'

const DEFAULT_FOV = BASE_FOV

/* Fixed camera poses selectable from the viewport toolbar. All poses look
   at the origin from the default camera distance, so switching poses never
   changes the framing scale — only the direction. */
export type CameraPoseId = 'default' | 'front' | 'side' | 'top'

const POSE_DISTANCE = Math.hypot(1.4, 1.1, 3.9) // ≈ 4.29, the default distance

export const CAMERA_POSES: { id: CameraPoseId; label: string; title: string; position: [number, number, number] }[] = [
  { id: 'default', label: '3/4', title: 'Three-quarter studio view (default)', position: [1.4, 1.1, 3.9] },
  { id: 'front', label: 'Front', title: 'Straight-on front view', position: [0, 0, POSE_DISTANCE] },
  { id: 'side', label: 'Side', title: 'Right side profile', position: [POSE_DISTANCE, 0, 0] },
  // a touch of z keeps OrbitControls' polar angle off the exact pole
  { id: 'top', label: 'Top', title: 'Top-down view', position: [0, POSE_DISTANCE * 0.997, POSE_DISTANCE * 0.075] },
]

export class SceneManager {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.05, 100)
  renderer!: THREE.WebGLRenderer
  controls!: OrbitControls

  /** pivot carries the animation pose; mesh carries user scale */
  private pivot = new THREE.Group()
  private mesh: THREE.Mesh
  /** one material per disconnected part (geometry group); index 0 always exists */
  private materials: THREE.MeshPhysicalMaterial[] = [createIconMaterial()]
  /** last applied settings — re-applied when a new geometry changes the part count */
  private lastMaterialSettings: MaterialSettings | null = null
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
  /** fires with the camera zoom (percent of default distance) on orbit */
  onZoomChange: ((pct: number) => void) | null = null
  /** fires when a custom environment map fails to load */
  onEnvError: ((msg: string) => void) | null = null

  private lastBackground: BackgroundSettings | null = null
  private lastLighting: LightingSettings | null = null

  gridVisible = false
  private renderPaused = false
  private userScale = 1
  private meshBaseRadius = 1
  /** export aspect ratio — drives the viewport fov & render frame */
  private exportAspect = 1

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.materials)
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
    this.applyEnvironment()
    // custom HDRIs decode asynchronously — swap them in once ready
    setEnvironmentChangedListener(() => this.applyEnvironment())

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    if (this.camera.position.lengthSq() < 1e-6) this.resetCamera()
    this.controls.addEventListener('change', () => this.reportZoom())
    this.reportZoom()
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
      // paused while an export renders: the export renderer owns the GPU
      // and mutates the shared scene per frame — drawing the viewport too
      // doubles GPU load and can flash half-posed frames
      if (this.renderPaused) return
      this.onFrame?.(dt)
      this.controls.update()
      this.updateBackgroundCover()
      this.renderer.render(this.scene, this.camera)
    }
    this.raf = requestAnimationFrame(loop)
  }

  unmount(): void {
    cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    this.controls?.dispose()
    this.mesh.geometry.dispose()
    for (const mat of this.materials) mat.dispose()
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
    this.updateViewportFov()
  }

  /** widen the viewport fov so the fixed-fov render frame always fits */
  private updateViewportFov(): void {
    this.camera.fov = viewportFov(this.camera.aspect, this.exportAspect)
    this.camera.updateProjectionMatrix()
  }

  setExportAspect(aspect: number): void {
    if (!isFinite(aspect) || aspect <= 0) return
    this.exportAspect = aspect
    this.updateViewportFov()
  }

  /* ---------------- geometry ---------------- */

  /** Swap in a new icon geometry. Caller (cache) owns disposal. */
  setGeometry(geometry: THREE.BufferGeometry): void {
    // a mesh with a material ARRAY renders only grouped ranges — make sure
    // even legacy/fallback geometry has at least one full-range group
    if (!geometry.groups.length) {
      geometry.addGroup(0, geometry.getAttribute('position')?.count ?? 0, 0)
    }
    this.mesh.geometry = geometry
    this.syncMaterialCount()
    this.meshBaseRadius = geometry.boundingSphere?.radius ?? 1
    this.updateGroundPosition()
  }

  /** Grow/shrink the material array to match the geometry's part groups. */
  private syncMaterialCount(): void {
    let needed = 1
    for (const group of this.mesh.geometry.groups) {
      needed = Math.max(needed, (group.materialIndex ?? 0) + 1)
    }
    if (needed === this.materials.length) return
    while (this.materials.length > needed) this.materials.pop()!.dispose()
    while (this.materials.length < needed) this.materials.push(createIconMaterial())
    if (this.lastMaterialSettings) this.applyMaterial(this.lastMaterialSettings)
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
    this.lastMaterialSettings = m
    this.materials.forEach((mat, i) => applyMaterialSettings(mat, m, i))
  }

  applyLighting(l: LightingSettings): void {
    this.lastLighting = l
    applyLightingSettings(this.rig, l)
    this.ground.visible = l.shadows
    if (l.envPreset === 'custom') {
      setCustomEnvironment(l.envMap, l.envMapType, (msg) => this.onEnvError?.(msg))
    }
    this.applyEnvironment()
    // studio controls: rotation + intensity live on the scene, exposure on
    // the renderer — the export renderer applies its own copies per frame
    this.scene.environmentRotation.set(0, THREE.MathUtils.degToRad(l.envRotation), 0)
    this.scene.environmentIntensity = l.envIntensity
    this.scene.backgroundIntensity = l.backgroundBrightness
    if (this.renderer) this.renderer.toneMappingExposure = l.exposure
    // solid-color backdrops don't react to backgroundIntensity — re-resolve
    if (this.lastBackground) this.applyBackground(this.lastBackground)
  }

  /** bundled studio preset / custom HDRI; room env only as a last fallback */
  private applyEnvironment(): void {
    const active = this.lastLighting ? getActiveEnvironment(this.lastLighting) : null
    this.scene.environment = active ?? this.envTexture
  }

  applyBackground(b: BackgroundSettings): void {
    this.lastBackground = b
    // image backdrops decode async — re-apply once the pixels are there
    const resolved = resolveBackground(b, () => {
      if (this.lastBackground === b) this.applyBackground(b)
    })
    if (resolved.clearColor) {
      // solid colors don't react to scene.backgroundIntensity — bake it in
      const brightness = this.lastLighting?.backgroundBrightness ?? 1
      this.scene.background = resolved.clearColor.multiplyScalar(brightness)
    } else {
      this.scene.background = resolved.texture
    }
    this.updateBackgroundCover()
  }

  /** keep an image backdrop cover-cropped to the current canvas aspect;
      cheap, runs every frame (the export renderer shares the texture and
      re-crops it for the export aspect while the viewport is paused) */
  private updateBackgroundCover(): void {
    if (!this.lastBackground || !backgroundIsImage(this.lastBackground)) return
    const bg = this.scene.background
    if (bg && (bg as THREE.Texture).isTexture) {
      applyBackgroundCover(bg as THREE.Texture, this.camera.aspect, this.lastBackground)
    }
  }

  setGrid(visible: boolean): void {
    this.gridVisible = visible
    this.grid.visible = visible
  }

  setAutoRotate(on: boolean): void {
    if (this.controls) this.controls.autoRotate = on
  }

  /** cap render resolution — 'auto' follows the device (max 2×) */
  setPixelRatioMode(mode: 'auto' | '1'): void {
    if (!this.renderer) return
    this.renderer.setPixelRatio(mode === '1' ? 1 : Math.min(window.devicePixelRatio, 2))
    this.resize()
  }

  private reportZoom(): void {
    if (!this.controls || !this.onZoomChange) return
    const defaultDist = new THREE.Vector3(1.4, 1.1, 3.9).length()
    const dist = this.camera.position.distanceTo(this.controls.target)
    this.onZoomChange(Math.round((defaultDist / Math.max(dist, 1e-4)) * 100))
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

  /** Jump to one of the fixed poses (¾ / front / side / top). */
  setCameraPose(id: CameraPoseId): void {
    const pose = CAMERA_POSES.find((p) => p.id === id) ?? CAMERA_POSES[0]
    this.setCameraState({
      position: [...pose.position],
      target: [0, 0, 0],
      autoRotate: this.controls?.autoRotate ?? false,
    })
  }

  /** Frame the object: keep view direction, adjust distance to fit.
      Fits against the RENDER frame (BASE_FOV), not the wider viewport,
      so "fit" means "fills the export nicely". */
  fitCamera(): void {
    const radius = Math.max(this.meshBaseRadius * this.userScale, 0.001)
    const renderFov = THREE.MathUtils.degToRad(BASE_FOV)
    const fov = Math.min(renderFov, 2 * Math.atan(Math.tan(renderFov / 2) * this.exportAspect))
    const distance = (radius / Math.tan(fov / 2)) * 1.18
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    if (dir.lengthSq() < 1e-9) dir.set(0, 0.25, 1).normalize()
    this.controls.target.set(0, 0, 0)
    this.camera.position.copy(dir.multiplyScalar(distance))
    this.controls.update()
  }

  /* ---------------- export support ---------------- */

  /** the live icon geometry + per-part materials (for 3D model export) */
  getIconModel(): { geometry: THREE.BufferGeometry; materials: THREE.MeshPhysicalMaterial[] } {
    return { geometry: this.mesh.geometry, materials: this.materials }
  }

  /** pause the viewport render loop for the duration of an export */
  setRenderPaused(paused: boolean): void {
    this.renderPaused = paused
    this.lastTick = performance.now() // don't integrate the paused span into dt
  }

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
