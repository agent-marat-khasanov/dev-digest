// Synthetic fixture module for architecture-reviewer evals — NOT part of the real DevDigest codebase.
// server/src/modules/notifications/service.ts — correctly layered: the service depends only on a
// port interface (injected via the constructor), never on a concrete adapter or a Drizzle handle.

export interface NotificationRepository {
  markSent(notificationId: string): Promise<void>;
}

export interface NotifierPort {
  send(to: string, message: string): Promise<void>;
}

export class NotificationsService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly notifier: NotifierPort,
  ) {}

  async sendAndMark(notificationId: string, to: string, message: string): Promise<void> {
    await this.notifier.send(to, message);
    await this.repo.markSent(notificationId);
  }
}
