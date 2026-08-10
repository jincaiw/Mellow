/**
 * shared —— 共享工具与通用类型（无平台依赖）。
 */

/** 延迟执行（重渲染/异步装饰节流） */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** 简单事件发射器（包间解耦） */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  on(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }
}

/** 运行时断言（开发期帮助，release 可剔除） */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[mellow] Assertion failed: ${message}`);
  }
}
