import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ReplaySubject, Subject } from 'rxjs';

export interface NotificationRealtimeEvent {
  type: 'notification';
  id: string;
  userId: string;
}

@Injectable()
export class NotificationsRealtimeService implements OnModuleDestroy {
  private readonly users = new Map<string, Subject<NotificationRealtimeEvent>>();

  connect(userId: string): Subject<NotificationRealtimeEvent> {
    let subject = this.users.get(userId);
    if (!subject) {
      subject = new ReplaySubject<NotificationRealtimeEvent>(1);
      this.users.set(userId, subject);
    }
    return subject;
  }

  disconnect(userId: string): void {
    const subject = this.users.get(userId);
    if (subject) {
      subject.complete();
      this.users.delete(userId);
    }
  }

  emit(event: NotificationRealtimeEvent): void {
    const subject = this.users.get(event.userId);
    subject?.next(event);
  }

  onModuleDestroy(): void {
    for (const subject of this.users.values()) {
      subject.complete();
    }
    this.users.clear();
  }
}
