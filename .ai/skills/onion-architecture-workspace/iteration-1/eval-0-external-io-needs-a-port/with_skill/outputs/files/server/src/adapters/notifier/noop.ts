import type { Notifier } from '@devdigest/shared';

/**
 * Null-object Notifier — wired by the container when no chat webhook is
 * configured. Keeps the decision "is notification switched on?" in the
 * composition root: callers always get a Notifier and never branch on config.
 */
export class NoopNotifier implements Notifier {
  readonly id = 'noop';

  async reviewRunFinished(): Promise<void> {}
}
