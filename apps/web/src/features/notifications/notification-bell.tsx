import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@wa/ui';
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react';

import { useDeleteNotification, useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadCount } from './api';

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: unread } = useUnreadCount();
  const { data, refetch } = useNotifications(1, 20);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const remove = useDeleteNotification();

  React.useEffect(() => {
    const source = new EventSource('/api/notifications/stream');
    source.onmessage = () => {
      void refetch();
    };
    source.onerror = () => undefined;
    return () => source.close();
  }, [refetch]);

  const count = unread?.count ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('notifications.title')} className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 ? (
            <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t('notifications.title')}</span>
          {count > 0 ? (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => void markAll.mutateAsync()}>
              <CheckCheck className="h-3.5 w-3.5" /> {t('notifications.markAllRead')}
            </Button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(data?.items ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
            <BellOff className="h-6 w-6" aria-hidden="true" />
            {t('notifications.empty')}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start gap-2 border-b px-3 py-2.5 last:border-0 ${notification.read ? '' : 'bg-accent/40'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-start text-sm font-medium hover:underline"
                      onClick={() => {
                        if (!notification.read) {
                          void markRead.mutate(notification.id);
                        }
                        if (notification.actionUrl) {
                          navigate(notification.actionUrl);
                        }
                      }}
                    >
                      {notification.title}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      aria-label={t('notifications.dismiss')}
                      onClick={() => void remove.mutate(notification.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                  {notification.message ? <p className="mt-0.5 text-xs text-muted-foreground">{notification.message}</p> : null}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
                {!notification.read ? (
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-xs text-primary hover:underline"
                    onClick={() => void markRead.mutate(notification.id)}
                  >
                    {t('notifications.markRead')}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/')}>
          <span className="text-sm">{t('notifications.open')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
