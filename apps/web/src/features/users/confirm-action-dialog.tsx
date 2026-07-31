import { useTranslation } from 'react-i18next';
import type { UserDto } from '@wa/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  toast,
} from '@wa/ui';

import { useUserAction } from './api';

export type UserStatusAction = 'suspend' | 'activate' | 'archive' | 'revoke-sessions';

export interface ConfirmActionDialogProps {
  action: UserStatusAction | null;
  user: UserDto | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function ConfirmActionDialog({ action, user, onOpenChange, onDone }: ConfirmActionDialogProps) {
  const { t } = useTranslation();
  const mutation = useUserAction(action ?? 'suspend');

  const open = action !== null && user !== null;

  const titleKey: Record<UserStatusAction, string> = {
    suspend: 'users.suspendTitle',
    activate: 'users.activateTitle',
    archive: 'users.archiveTitle',
    'revoke-sessions': 'users.revokeSessionsTitle',
  };

  const descriptionKey: Record<UserStatusAction, string> = {
    suspend: 'users.suspendDescription',
    activate: 'users.activateDescription',
    archive: 'users.archiveDescription',
    'revoke-sessions': 'users.revokeSessionsDescription',
  };

  const successKey: Record<UserStatusAction, string> = {
    suspend: 'users.suspendedSuccess',
    activate: 'users.activatedSuccess',
    archive: 'users.archivedSuccess',
    'revoke-sessions': 'users.revokeSessionsSuccess',
  };

  const confirm = async () => {
    if (!action || !user) {
      return;
    }
    try {
      await mutation.mutateAsync(user.id);
      toast.success(t(successKey[action]));
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action ? t(titleKey[action]) : ''}</AlertDialogTitle>
          <AlertDialogDescription>
            {action && user ? t(descriptionKey[action], { name: user.name }) : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={mutation.isPending}>
              {t('common.cancel')}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant={action === 'archive' || action === 'suspend' ? 'destructive' : 'default'} onClick={() => void confirm()} disabled={mutation.isPending}>
              {t('common.confirm')}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
