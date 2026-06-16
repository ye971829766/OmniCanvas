export default class Spring {
  public value: number;
  public target: number;
  public velocity: number;
  public stiffness: number;
  public damping: number;
  public mass: number;

  constructor(value: number, config = { stiffness: 400, damping: 25, mass: 0.8 }) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = config.stiffness;
    this.damping = config.damping;
    this.mass = config.mass;
  }

  set(target: number) {
    this.target = target;
  }

  update(dt: number) {
    // max dt cap to avoid huge jumps
    dt = Math.min(dt, 0.064);

    const displacement = this.value - this.target;
    const springForce = -this.stiffness * displacement;
    const dampingForce = -this.damping * this.velocity;
    const acceleration = (springForce + dampingForce) / this.mass;

    this.velocity += acceleration * dt;
    this.value += this.velocity * dt;

    return this.value;
  }
}
