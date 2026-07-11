export class InvalidToolCallGuard {
  private consecutiveInvalidSteps = 0;

  constructor(private readonly maxConsecutiveInvalidSteps = 3) {}

  recordStep(totalCalls: number, validCalls: number): boolean {
    if (totalCalls === 0 || validCalls > 0) {
      this.consecutiveInvalidSteps = 0;
      return false;
    }

    this.consecutiveInvalidSteps += 1;
    return this.consecutiveInvalidSteps >= this.maxConsecutiveInvalidSteps;
  }
}
