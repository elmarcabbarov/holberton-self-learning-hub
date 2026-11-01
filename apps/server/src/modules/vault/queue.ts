/** Serializes async work: every vault mutation and reconcile runs one at a time (D-051). */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Resolves when everything queued so far has finished. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }
}
