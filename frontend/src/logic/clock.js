// Monotonic time (immune to wall-clock changes) for all auction timing.
export const nowMs = () => performance.now();
