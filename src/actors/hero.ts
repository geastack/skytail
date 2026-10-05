// The asset kit geometry uses game units and faces +X.
// Rigid parts rotate around their baked pivots. The cape uses a separate cloth surface.
import { DoubleSide } from 'three/src/constants.js';
import { BufferGeometry } from 'three/src/core/BufferGeometry.js';
import { BufferAttribute, Uint16BufferAttribute } from 'three/src/core/BufferAttribute.js';
import { Object3D } from 'three/src/core/Object3D.js';
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import type { Camera } from 'three/src/cameras/Camera.js';
import { HeroEyes } from './hero-eyes';
import { Mesh } from 'three/src/objects/Mesh.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { FlightForces, FlightJoint } from './flight-joint';
import type { FlightFrame } from './flight-joint';
import { KIT_UNITS_PER_METRE } from '../config';
import { M_COYOTE_SUPERMAN } from '../kit/generated/kit-ids';
import { sharedKit } from '../kit/kit';

const U = KIT_UNITS_PER_METRE;
const ROWS = 22;
const COLS = 9;
const CAPE_COLOUR = 0xd8232a;
const CAPE_LENGTH = 2.7 * U;

// The squared row fraction keeps the collar fixed while the hem follows bank and crash motion.
const TRAIL_LAG = 220; // The lag uses milliseconds.
const TRAIL_BANK = 1.6 * U;
const TRAIL_CRASH = 1.2 * U;
const TRAIL_WHIP = 3.0 * U;

/**
 * The generic type preserves the caller's array type.
 * The native compiler cannot convert KitPart[] or KitSocket[] to an array of narrower records.
 */
function indexOf<T extends { name: string }>(list: T[], name: string): number {
  for (let i = 0; i < list.length; i++) {
    if (list[i].name === name) return i;
  }
  throw new Error('hero: kit model has no ' + name);
}

/** The controller poses mesh. Body animation uses an inner node to preserve that position and rotation. */
export class Hero {
  readonly mesh: Object3D;

  private readonly body = new Object3D();
  private readonly head: Mesh;
  private readonly earL: Mesh;
  private readonly earR: Mesh;
  private readonly legL: Mesh;
  private readonly legR: Mesh;
  private readonly tail1: Mesh;
  private readonly tail2: Mesh;
  private readonly tail3: Mesh;
  private readonly capePos: Float32Array;
  private readonly capeNrm: Float32Array;
  private readonly cape: Mesh;
  private readonly eyes: HeroEyes;

  // The cape frame uses hero-local game units from the baked sockets.
  private readonly neckX: number;
  private readonly neckY: number;
  private readonly neckZ: number;
  private readonly baseX: number;
  private readonly baseY: number;
  private readonly baseZ: number;
  private readonly fwdX: number;
  private readonly fwdY: number;
  private readonly fwdZ: number;
  private readonly rightX: number;
  private readonly rightY: number;
  private readonly rightZ: number;
  private readonly backX: number;
  private readonly backY: number;
  private readonly backZ: number;
  private readonly torsoLen: number;
  private readonly baseR: number;
  private readonly topR: number;
  private readonly neckR: number;
  private readonly neckAlong: number;

  private flow = 0; // The airflow clock uses seconds and advances faster with throttle.
  private trailSide = 0;
  private trailUp = 0;
  private limp = 0;
  private readonly forces = new FlightForces();
  private readonly joints: FlightJoint[] = [];
  // The host supplies its reduced motion preference.
  reducedMotion = false;

  constructor() {
    const kit = sharedKit();
    const model = kit.modelById(M_COYOTE_SUPERMAN);
    // Keep the authored colours constant across lighting conditions.
    const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false, fog: false });

    this.mesh = new Object3D();
    this.mesh.add(this.body);
    const trunk = new Mesh(kit.geometryById(M_COYOTE_SUPERMAN, 'main'), material);
    this.body.add(trunk);

    // Each part geometry uses coordinates relative to its baked joint.
    const headPivot = model.parts[indexOf(model.parts, 'Head')].pivot;
    this.head = this.part('Head', material, headPivot[0] * U, headPivot[1] * U, headPivot[2] * U);
    this.body.add(this.head);
    this.earL = this.relative('Ear_L', material, headPivot);
    this.earR = this.relative('Ear_R', material, headPivot);
    this.head.add(this.earL);
    this.head.add(this.earR);
    this.eyes = new HeroEyes(this.head, [this.head, this.earL, this.earR]);

    const hipL = model.parts[indexOf(model.parts, 'Leg_L')].pivot;
    const hipR = model.parts[indexOf(model.parts, 'Leg_R')].pivot;
    this.legL = this.part('Leg_L', material, hipL[0] * U, hipL[1] * U, hipL[2] * U);
    this.legR = this.part('Leg_R', material, hipR[0] * U, hipR[1] * U, hipR[2] * U);
    this.body.add(this.legL);
    this.body.add(this.legR);

    const root1 = model.parts[indexOf(model.parts, 'Tail_1')].pivot;
    this.tail1 = this.part('Tail_1', material, root1[0] * U, root1[1] * U, root1[2] * U);
    this.tail2 = this.relative('Tail_2', material, root1);
    this.tail3 = this.relative('Tail_3', material, model.parts[indexOf(model.parts, 'Tail_2')].pivot);
    this.body.add(this.tail1);
    this.tail1.add(this.tail2);
    this.tail2.add(this.tail3);

    // Update parents before children to propagate neck and tail motion.
    // Angle limits keep gaps between rigid parts small.
    // The heavy head needs extra damping and muscle support to limit its swing.
    const headJoint = this.joint('Head', this.head, this.forces.frame, 2.4, 0.04, 0.03, 0.045, 0.95, 600, 80);
    this.joint('Ear_L', this.earL, headJoint.frame, 0.80, 0.12, 0.08, 0.30);
    this.joint('Ear_R', this.earR, headJoint.frame, 0.85, 0.12, 0.08, 0.30);
    this.joint('Leg_L', this.legL, this.forces.frame, 1.60, 0.10, 0.12, 0.22, 0.80);
    this.joint('Leg_R', this.legR, this.forces.frame, 1.65, 0.10, 0.12, 0.22, 0.80);
    const tailRoot = this.joint('Tail_1', this.tail1, this.forces.frame, 0.85, 0.10, 0.16, 0.18, 0.65);
    const tailMiddle = this.joint('Tail_2', this.tail2, tailRoot.frame, 1.10, 0.10, 0.18, 0.20, 0.65);
    this.joint('Tail_3', this.tail3, tailMiddle.frame, 1.35, 0.10, 0.20, 0.22, 0.65);

    // Socket positions define the torso cone and collar.
    // Forward follows the torso axis. Right crosses the body. Back points away from the spine.
    const neck = model.sockets[indexOf(model.sockets, 'Neck')].position;
    const base = model.sockets[indexOf(model.sockets, 'Torso_Base')].position;
    const top = model.sockets[indexOf(model.sockets, 'Torso_Top')].position;
    const baseRim = model.sockets[indexOf(model.sockets, 'Torso_Base_Rim')].position;
    const topRim = model.sockets[indexOf(model.sockets, 'Torso_Top_Rim')].position;
    this.neckX = neck[0] * U;
    this.neckY = neck[1] * U;
    this.neckZ = neck[2] * U;
    this.baseX = base[0] * U;
    this.baseY = base[1] * U;
    this.baseZ = base[2] * U;
    const ax = (top[0] - base[0]) * U;
    const ay = (top[1] - base[1]) * U;
    const az = (top[2] - base[2]) * U;
    this.torsoLen = Math.sqrt(ax * ax + ay * ay + az * az);
    this.fwdX = ax / this.torsoLen;
    this.fwdY = ay / this.torsoLen;
    this.fwdZ = az / this.torsoLen;

    let rx = this.fwdZ;
    let ry = 0;
    let rz = -this.fwdX;
    const rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    rx /= rl;
    ry /= rl;
    rz /= rl;
    this.rightX = rx;
    this.rightY = ry;
    this.rightZ = rz;
    this.backX = this.fwdY * rz - this.fwdZ * ry;
    this.backY = this.fwdZ * rx - this.fwdX * rz;
    this.backZ = this.fwdX * ry - this.fwdY * rx;
    this.baseR = this.distance(baseRim, base);
    this.topR = this.distance(topRim, top);
    this.neckAlong = ((neck[0] - base[0]) * this.fwdX + (neck[1] - base[1]) * this.fwdY + (neck[2] - base[2]) * this.fwdZ) * U;
    this.neckR = this.radiusAt(this.neckAlong) + 0.02 * U;

    const capeGeometry = new BufferGeometry();
    this.capePos = new Float32Array(ROWS * COLS * 3);
    this.capeNrm = new Float32Array(ROWS * COLS * 3);
    const indices = new Uint16Array((ROWS - 1) * (COLS - 1) * 6);
    let k = 0;
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const a = r * COLS + c;
        indices[k] = a;
        indices[k + 1] = a + COLS;
        indices[k + 2] = a + 1;
        indices[k + 3] = a + 1;
        indices[k + 4] = a + COLS;
        indices[k + 5] = a + COLS + 1;
        k += 6;
      }
    }
    // BufferAttribute retains these arrays. Float32BufferAttribute copies them, which would disconnect the update loop.
    capeGeometry.setAttribute('position', new BufferAttribute(this.capePos, 3));
    capeGeometry.setAttribute('normal', new BufferAttribute(this.capeNrm, 3));
    capeGeometry.setIndex(new Uint16BufferAttribute(indices, 1));
    this.cape = new Mesh(capeGeometry, new MeshBasicMaterial({ color: CAPE_COLOUR, side: DoubleSide, toneMapped: false, fog: false }));
    this.cape.name = 'Cape';
    // Cape motion can exceed a bounding sphere computed from one frame.
    this.cape.frustumCulled = false;
    this.mesh.add(this.cape);

    this.update(0, 1.2, false, 0);
  }

  private part(name: string, material: MeshBasicMaterial, x: number, y: number, z: number): Mesh {
    const mesh = new Mesh(sharedKit().geometryById(M_COYOTE_SUPERMAN, name), material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    return mesh;
  }

  private relative(name: string, material: MeshBasicMaterial, parentPivot: number[]): Mesh {
    const model = sharedKit().modelById(M_COYOTE_SUPERMAN);
    const pivot = model.parts[indexOf(model.parts, name)].pivot;
    return this.part(name, material, (pivot[0] - parentPivot[0]) * U, (pivot[1] - parentPivot[1]) * U, (pivot[2] - parentPivot[2]) * U);
  }

  private distance(a: number[], b: number[]): number {
    const dx = (a[0] - b[0]) * U;
    const dy = (a[1] - b[1]) * U;
    const dz = (a[2] - b[2]) * U;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** along measures game units from the torso base along its axis. */
  private radiusAt(along: number): number {
    const t = along < 0 ? 0 : along > this.torsoLen ? 1 : along / this.torsoLen;
    return this.baseR + (this.topR - this.baseR) * t;
  }

  private joint(name: string, mesh: Mesh, parent: FlightFrame, mass: number, x: number, y: number, z: number, support = 0, stiffness = 100, damping = 10): FlightJoint {
    const parts = sharedKit().modelById(M_COYOTE_SUPERMAN).parts;
    const part = parts[indexOf(parts, name)];
    // Approximate each point mass at the bounding-box centre, in asset kit metres.
    const centre = new Vector3(
      (part.bboxMin[0] + part.bboxMax[0]) * 0.5,
      (part.bboxMin[1] + part.bboxMax[1]) * 0.5,
      (part.bboxMin[2] + part.bboxMax[2]) * 0.5,
    );
    const joint = new FlightJoint(mesh, parent, centre, mass, new Vector3(x, y, z), support, stiffness, damping);
    this.joints.push(joint);
    return joint;
  }

  hit(): void {
    const strength = this.reducedMotion ? 0.25 : 1;
    for (let i = 0; i < this.joints.length; i++) this.joints[i].impulse(-1.8 * strength);
    this.trailUp += TRAIL_WHIP * strength;
    this.trailSide -= TRAIL_WHIP * strength;
  }

  /** Call this after the controller and camera move. */
  prepareRender(camera: Camera): void {
    this.mesh.updateMatrixWorld(true);
    this.eyes.update(camera);
  }

  /** Reset after an anchor teleport to prevent a large physical impulse. */
  reset(): void {
    this.forces.reset();
    this.forces.frame.rotation.copy(this.mesh.quaternion);
    for (let i = 0; i < this.joints.length; i++) this.joints[i].reset();
    this.limp = 0;
    this.trailSide = 0;
    this.trailUp = 0;
    this.flow = 0;
    this.updateCape();
  }

  update(dtMs: number, throttle: number, crashing: boolean, bank: number): void {
    const dt = Math.max(0, Math.min(dtMs, 60)) * 0.001;
    if (dt > 0) {
      this.forces.update(this.mesh, dt, throttle, crashing);
      const steps = Math.ceil(dt * 240);
      const step = dt / steps;
      const motionScale = this.reducedMotion ? 0.25 : 1;
      for (let s = 0; s < steps; s++) {
        this.limp += ((crashing ? 1 : 0) - this.limp) * (1 - Math.exp(-step * 1.6));
        for (let i = 0; i < this.joints.length; i++) {
          this.joints[i].step(step, this.forces.airForce, this.limp, motionScale);
        }
      }
      const drive = Math.max(0, Math.min(1, (throttle - 1.2) / 0.4));
      this.flow += dt * (0.9 + 0.6 * drive);
      const ease = 1 - Math.exp(-dt * 1000 / TRAIL_LAG);
      this.trailSide += (-bank * TRAIL_BANK * motionScale - this.trailSide) * ease;
      this.trailUp += ((crashing ? TRAIL_CRASH * motionScale : 0) - this.trailUp) * ease;
    }
    this.updateCape();
  }

  /**
   * The top row wraps the neck. Lower rows follow an arc that clears the torso cone.
   * Scalar calculations avoid allocating a Vector3 for each vertex in each frame.
   */
  private updateCape(): void {
    const pos = this.capePos;
    const t = this.reducedMotion ? 0 : this.flow;
    for (let r = 0; r < ROWS; r++) {
      const s = r / (ROWS - 1);
      const along = this.neckAlong - CAPE_LENGTH * s * (1 - 0.12 * s);
      const clearance = this.radiusAt(along) + 0.03 * U;
      // Lift stays positive so ripples move the cape away from the body.
      const billow = 0.1 * U * Math.sin(Math.PI * Math.min(1, s * 1.15)) * (1 + 0.25 * Math.sin(t * 1.6 - s * 3));
      const lift = billow
        + (0.04 + 0.22 * s * s) * U * (1 + Math.sin(t * 7.5 - s * 9.5)) * 0.5
        + (0.02 + 0.08 * s) * U * (1 + Math.sin(t * 4.2 - s * 5.7 + 1.3)) * 0.5;
      const sway = (0.02 + 0.1 * s) * U * Math.sin(t * 3.1 - s * 4 + 0.7);
      const spread = (0.3 + 0.55 * s) * U;
      const arc = (clearance > spread ? clearance : spread) + lift;
      const halfAngle = (0.55 + 0.35 * s) * Math.PI * 0.5;
      const wrap = s * 4 > 1 ? 0 : 1 - s * 4;
      const blend = 1 - wrap;
      const axX = this.baseX + this.fwdX * along;
      const axY = this.baseY + this.fwdY * along;
      const axZ = this.baseZ + this.fwdZ * along;
      const drag = s * s;
      const sideTrail = sway + this.trailSide * drag;
      const upTrail = this.trailUp * drag;
      for (let c = 0; c < COLS; c++) {
        const u = c / (COLS - 1) - 0.5;
        const edge = (u < 0 ? -u : u) * 2;
        const angle = u * Math.PI;
        const ringR = Math.sin(angle) * this.neckR;
        const ringB = Math.cos(angle) * this.neckR;
        const ringX = this.neckX + this.rightX * ringR + this.backX * ringB;
        const ringY = this.neckY + this.rightY * ringR + this.backY * ringB;
        const ringZ = this.neckZ + this.rightZ * ringR + this.backZ * ringB;
        const theta = u * 2 * halfAngle;
        const flap = (0.03 + 0.12 * s) * U * edge * (1 + Math.sin(t * 9.3 - s * 7 + u * 5.2)) * 0.5;
        const outR = arc * Math.sin(theta) + sideTrail;
        const outB = arc * Math.cos(theta) + flap;
        const gravity = 0.05 * U * edge * s;
        const flatX = axX + this.rightX * outR + this.backX * outB;
        const flatY = axY + this.rightY * outR + this.backY * outB - gravity + upTrail;
        const flatZ = axZ + this.rightZ * outR + this.backZ * outB;
        const i = (r * COLS + c) * 3;
        pos[i] = ringX + (flatX - ringX) * blend;
        pos[i + 1] = ringY + (flatY - ringY) * blend;
        pos[i + 2] = ringZ + (flatZ - ringZ) * blend;
      }
    }
    this.capeNormals();
    this.cape.geometry.attributes.position.needsUpdate = true;
    this.cape.geometry.attributes.normal.needsUpdate = true;
  }

  /** Central differences compute grid normals from adjacent tangents without traversing the index buffer. */
  private capeNormals(): void {
    const pos = this.capePos;
    const nrm = this.capeNrm;
    for (let r = 0; r < ROWS; r++) {
      const rowPrev = (r > 0 ? r - 1 : r) * COLS;
      const rowNext = (r < ROWS - 1 ? r + 1 : r) * COLS;
      for (let c = 0; c < COLS; c++) {
        const cPrev = c > 0 ? c - 1 : c;
        const cNext = c < COLS - 1 ? c + 1 : c;
        const a = ((r * COLS) + cNext) * 3;
        const b = ((r * COLS) + cPrev) * 3;
        const d = (rowNext + c) * 3;
        const e = (rowPrev + c) * 3;
        const ux = pos[a] - pos[b];
        const uy = pos[a + 1] - pos[b + 1];
        const uz = pos[a + 2] - pos[b + 2];
        const vx = pos[d] - pos[e];
        const vy = pos[d + 1] - pos[e + 1];
        const vz = pos[d + 2] - pos[e + 2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 1e-6) {
          nx /= len;
          ny /= len;
          nz /= len;
        } else {
          nx = 0;
          ny = 1;
          nz = 0;
        }
        const i = (r * COLS + c) * 3;
        nrm[i] = nx;
        nrm[i + 1] = ny;
        nrm[i + 2] = nz;
      }
    }
  }
}
