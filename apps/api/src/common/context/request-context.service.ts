import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  requestId: string;
  ipAddress: string;
  userAgent: string;
  actorUserId?: string;
  actorRole?: string;
}

export interface RequestContextSnapshot {
  requestId: string;
  ipAddress: string;
  userAgent: string;
  actorUserId?: string;
  actorRole?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextData>();

  run<T>(data: RequestContextData, callback: () => T): T {
    return this.storage.run(data, callback);
  }

  get current(): RequestContextSnapshot {
    const store = this.storage.getStore();
    if (!store) {
      return { requestId: 'unknown', ipAddress: '', userAgent: '' };
    }
    return {
      requestId: store.requestId,
      ipAddress: store.ipAddress,
      userAgent: store.userAgent,
      actorUserId: store.actorUserId,
      actorRole: store.actorRole,
    };
  }

  setActor(actorUserId: string, actorRole: string): void {
    const store = this.storage.getStore();
    if (store) {
      store.actorUserId = actorUserId;
      store.actorRole = actorRole;
    }
  }
}
