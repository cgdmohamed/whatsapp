import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { InboxRealtimeEvent, Role } from '@wa/shared';

export interface InboxUserConnection {
  userId: string;
  role: Role;
  canViewUnassigned: boolean;
}

export interface AccessibleConversation {
  assignedUserId: string | null;
}

@Injectable()
export class InboxRealtimeService {
  private readonly subjects = new Map<string, Subject<InboxRealtimeEvent>>();
  private readonly connections = new Map<string, InboxUserConnection>();

  connect(userId: string, connection: InboxUserConnection): Subject<InboxRealtimeEvent> {
    let subject = this.subjects.get(userId);
    if (!subject) {
      subject = new Subject<InboxRealtimeEvent>();
      this.subjects.set(userId, subject);
    }
    this.connections.set(userId, connection);
    return subject;
  }

  disconnect(userId: string): void {
    this.connections.delete(userId);
    const subject = this.subjects.get(userId);
    if (subject) {
      subject.complete();
      this.subjects.delete(userId);
    }
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }

  emitToUser(userId: string, event: InboxRealtimeEvent): void {
    this.subjects.get(userId)?.next(event);
  }

  emitToConversation(event: InboxRealtimeEvent, conversation: AccessibleConversation | null): void {
    for (const [userId, connection] of this.connections) {
      if (conversation && this.canAccess(connection, conversation)) {
        this.subjects.get(userId)?.next(event);
      }
    }
  }

  private canAccess(connection: InboxUserConnection, conversation: AccessibleConversation): boolean {
    if (connection.role === 'ADMIN' || connection.role === 'MANAGER') {
      return true;
    }
    if (conversation.assignedUserId === connection.userId) {
      return true;
    }
    return connection.canViewUnassigned && conversation.assignedUserId === null;
  }
}
