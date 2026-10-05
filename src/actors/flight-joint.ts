import type { Object3D } from 'three/src/core/Object3D.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { KIT_UNITS_PER_METRE } from '../config';

/** Positions use metres. Time uses seconds. Angles use radians. */
export class FlightFrame {
  readonly rotation = new Quaternion();
  readonly acceleration = new Vector3();
  readonly omega = new Vector3();
  readonly alpha = new Vector3();
}

/**
 * Each joint models an angular spring with a point mass at the part centre.
 * Gravity, air drag, and parent motion drive the spring.
 */
export class FlightJoint {
  readonly frame = new FlightFrame();
  private readonly angle = new Vector3();
  private readonly velocity = new Vector3();
  private readonly inverse = new Quaternion();
  private readonly offset = new Vector3();
  private readonly lever = new Vector3();
  private readonly force = new Vector3();
  private readonly torque = new Vector3();
  private readonly parentAlpha = new Vector3();
  private readonly parentOmega = new Vector3();
  private readonly scratch = new Vector3();
  private readonly angularAcceleration = new Vector3();
  private readonly lengthSquared: number;

  constructor(
    private readonly mesh: Object3D,
    private readonly parent: FlightFrame,
    private readonly centre: Vector3,
    private readonly mass: number,
    private readonly limits: Vector3,
    private readonly support: number,
    private readonly stiffness = 100,
    private readonly damping = 10,
  ) {
    this.lengthSquared = Math.max(centre.lengthSq(), 0.01);
  }

  reset(): void {
    this.angle.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.frame.rotation.copy(this.parent.rotation);
    this.frame.acceleration.set(0, 0, 0);
    this.frame.omega.set(0, 0, 0);
    this.frame.alpha.set(0, 0, 0);
  }

  impulse(strength: number): void {
    this.velocity.z += strength / this.mass;
  }

  step(dt: number, airForce: Vector3, limp: number, motionScale: number): void {
    const parent = this.parent;
    const frame = this.frame;
    this.inverse.copy(parent.rotation).invert();
    this.offset.copy(this.mesh.position).multiplyScalar(1 / KIT_UNITS_PER_METRE).applyQuaternion(parent.rotation);
    // Pivot acceleration includes tangential and centripetal terms.
    frame.acceleration.copy(parent.acceleration);
    this.scratch.crossVectors(parent.alpha, this.offset);
    frame.acceleration.add(this.scratch);
    this.scratch.crossVectors(parent.omega, this.offset);
    this.scratch.crossVectors(parent.omega, this.scratch);
    frame.acceleration.add(this.scratch).clampLength(0, 40);

    this.force.copy(airForce);
    // Muscle support counters gravity during flight and decreases during a crash.
    // Ears have no muscle support.
    this.force.y -= 9.81 * (1 - this.support * (1 - limp));
    this.force.sub(frame.acceleration).applyQuaternion(this.inverse);
    this.lever.copy(this.centre).applyQuaternion(this.mesh.quaternion);
    this.torque.crossVectors(this.lever, this.force).multiplyScalar(1 / this.lengthSquared);
    this.parentAlpha.copy(parent.alpha).applyQuaternion(this.inverse);
    this.parentOmega.copy(parent.omega).applyQuaternion(this.inverse);
    // Air drag also resists angular motion.
    this.torque.addScaledVector(this.parentAlpha, -1).addScaledVector(this.parentOmega, -4);
    this.torque.clampLength(0, 80).multiplyScalar(motionScale);

    const stiffness = this.stiffness * (1 - 0.65 * limp) / this.mass;
    const damping = this.damping / this.mass + 4;
    this.angularAcceleration.copy(this.torque)
      .addScaledVector(this.angle, -stiffness)
      .addScaledVector(this.velocity, -damping);
    // Hero divides the semi-implicit Euler integration into time steps of at most 1/240 second.
    this.velocity.addScaledVector(this.angularAcceleration, dt);
    this.angle.addScaledVector(this.velocity, dt);
    const limitScale = (1 + 0.5 * limp) * motionScale;
    this.limitAxis(0, this.limits.x * limitScale);
    this.limitAxis(1, this.limits.y * limitScale);
    this.limitAxis(2, this.limits.z * limitScale);
    this.mesh.rotation.set(this.angle.x, this.angle.y, this.angle.z);

    frame.rotation.multiplyQuaternions(parent.rotation, this.mesh.quaternion);
    this.scratch.copy(this.velocity).applyQuaternion(parent.rotation);
    frame.omega.copy(parent.omega).add(this.scratch);
    frame.alpha.crossVectors(parent.omega, this.scratch).add(parent.alpha);
    this.scratch.copy(this.angularAcceleration).applyQuaternion(parent.rotation);
    frame.alpha.add(this.scratch).clampLength(0, 80);
  }

  private limitAxis(axis: number, limit: number): void {
    const angle = this.angle.getComponent(axis);
    if (angle > limit || angle < -limit) {
      this.angle.setComponent(axis, Math.max(-limit, Math.min(limit, angle)));
      // Remove velocity toward the angle limit. Preserve velocity away from the limit.
      if (angle * this.velocity.getComponent(axis) > 0) this.velocity.setComponent(axis, 0);
      this.angularAcceleration.setComponent(axis, 0);
    }
  }
}

export class FlightForces {
  readonly frame = new FlightFrame();
  readonly airForce = new Vector3();
  private readonly position = new Vector3();
  private readonly velocity = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly delta = new Quaternion();
  private readonly sample = new Vector3();
  private initialized = false;

  reset(): void {
    this.initialized = false;
    this.velocity.set(0, 0, 0);
    this.frame.acceleration.set(0, 0, 0);
    this.frame.omega.set(0, 0, 0);
    this.frame.alpha.set(0, 0, 0);
  }

  update(mesh: Object3D, dt: number, throttle: number, crashing: boolean): void {
    const frame = this.frame;
    frame.rotation.copy(mesh.quaternion);
    if (!this.initialized) {
      this.position.copy(mesh.position);
      this.rotation.copy(mesh.quaternion);
      this.initialized = true;
    }
    // Filter measured velocities before differentiation to reduce rapid joint oscillation from cursor samples.
    const follow = 1 - Math.exp(-dt / 0.06);
    this.sample.copy(mesh.position).sub(this.position).multiplyScalar(1 / (dt * KIT_UNITS_PER_METRE));
    this.sample.clampLength(0, 30).sub(this.velocity).multiplyScalar(follow);
    frame.acceleration.copy(this.sample).multiplyScalar(1 / dt).clampLength(0, 40);
    this.velocity.add(this.sample);
    this.position.copy(mesh.position);

    this.delta.copy(this.rotation).invert();
    this.delta.premultiply(mesh.quaternion).normalize();
    // Quaternions q and -q describe the same pose. Use the shortest rotation across the 2*PI to 0 boundary.
    const sign = this.delta.w < 0 ? -1 : 1;
    const sine = Math.sqrt(this.delta.x * this.delta.x + this.delta.y * this.delta.y + this.delta.z * this.delta.z);
    const rate = sine < 1e-8 ? 0 : 2 * Math.atan2(sine, Math.abs(this.delta.w)) * sign / (sine * dt);
    this.sample.set(this.delta.x * rate, this.delta.y * rate, this.delta.z * rate);
    this.sample.sub(frame.omega).multiplyScalar(follow);
    frame.alpha.copy(this.sample).multiplyScalar(1 / dt).clampLength(0, 80);
    frame.omega.add(this.sample);
    this.rotation.copy(mesh.quaternion);

    // The hero stays fixed along X while the scenery moves. Include the implied forward airspeed.
    const speed = crashing ? 0 : 8 * Math.max(0, throttle) / 1.2;
    this.airForce.copy(this.velocity).multiplyScalar(-1);
    this.airForce.x -= speed;
    this.airForce.multiplyScalar(0.06 * this.airForce.length()).clampLength(0, 25);
  }
}
