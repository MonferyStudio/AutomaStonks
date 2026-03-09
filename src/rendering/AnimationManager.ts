type EasingFn = (t: number) => number;

interface Animation {
  id: string;
  elapsed: number;
  duration: number;
  update: (progress: number) => void;
  onComplete?: () => void;
  easing: EasingFn;
}

export const Easing = {
  linear: (t: number) => t,
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeIn: (t: number) => t * t,
} as const;

let nextAnimId = 0;

export class AnimationManager {
  private animations = new Map<string, Animation>();

  add(
    duration: number,
    update: (progress: number) => void,
    onComplete?: () => void,
    easing: EasingFn = Easing.easeInOut,
  ): string {
    const id = `anim_${nextAnimId++}`;
    this.animations.set(id, {
      id,
      elapsed: 0,
      duration,
      update,
      onComplete,
      easing,
    });
    return id;
  }

  cancel(id: string): void {
    this.animations.delete(id);
  }

  update(deltaMs: number): void {
    const toRemove: string[] = [];

    for (const [id, anim] of this.animations) {
      anim.elapsed += deltaMs;
      const rawProgress = Math.min(anim.elapsed / anim.duration, 1);
      const easedProgress = anim.easing(rawProgress);
      anim.update(easedProgress);

      if (rawProgress >= 1) {
        anim.onComplete?.();
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.animations.delete(id);
    }
  }

  get activeCount(): number {
    return this.animations.size;
  }

  clear(): void {
    this.animations.clear();
  }
}
