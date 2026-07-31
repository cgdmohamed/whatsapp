import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ROLES,
  USER_STATUSES,
  type Role,
  type UserDto,
  type UserQuery,
  type UserStatus,
} from '@wa/shared';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@wa/ui';
import { MoreHorizontal, Plus, Search, UserRound, X } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { useDebouncedValue } from '../hooks/use-debounce';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useUsers } from '../features/users/api';
import { ConfirmActionDialog, type UserStatusAction } from '../features/users/confirm-action-dialog';
import { ResetPasswordDialog } from '../features/users/reset-password-dialog';
import { UserFormDialog } from '../features/users/user-form-dialog';

const ROLE_BADGE: Record<Role, 'default' | 'secondary' | 'outline'> = {
  ADMIN: 'default',
  MANAGER: 'secondary',
  AGENT: 'outline',
};

const STATUS_BADGE: Record<UserStatus, 'success' | 'warning' | 'muted'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  ARCHIVED: 'muted',
};

export function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<Role | ''>('');
  const [statusFilter, setStatusFilter] = React.useState<UserStatus | ''>('');
  const debouncedSearch = useDebouncedValue(search);

  const query: UserQuery = {
    page,
    pageSize,
    search: debouncedSearch || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  };

  const { data, isLoading, isError, refetch, isFetching } = useUsers(query);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserDto | null>(null);
  const [resetUser, setResetUser] = React.useState<UserDto | null>(null);
  const [confirmAction, setConfirmAction] = React.useState<UserStatusAction | null>(null);
  const [actionUser, setActionUser] = React.useState<UserDto | null>(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const openCreate = () => {
    setEditingUser(null);
    setFormOpen(true);
  };

  const openEdit = (user: UserDto) => {
    setEditingUser(user);
    setFormOpen(true);
  };

  const requestAction = (action: UserStatusAction, user: UserDto) => {
    setConfirmAction(action);
    setActionUser(user);
  };

  const canEdit = (user: UserDto) =>
    isAdmin || (currentUser?.role === 'MANAGER' && user.role === 'AGENT') || user.id === currentUser?.id;

  const canAdminister = (user: UserDto) => isAdmin && user.id !== currentUser?.id;

  const statusLabel = (status: UserStatus) => t(`status.${status}`);

  const hasFilters = search.length > 0 || roleFilter !== '' || statusFilter !== '';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t('users.create')}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={t('users.searchPlaceholder')}
              className="ps-9"
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(value) => {
              setRoleFilter(value as Role | '');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={t('users.roleFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('common.all')}</SelectItem>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {t(`roles.${role}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as UserStatus | '');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={t('users.statusFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('common.all')}</SelectItem>
              {USER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4" />
              {t('common.clear')}
            </Button>
          ) : null}
        </div>
      </div>

      {isError ? (
        <ErrorState
          title={t('common.error')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
          loading={isFetching}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.name')}</TableHead>
                <TableHead>{t('users.role')}</TableHead>
                <TableHead>{t('users.status')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('users.language')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('users.lastLogin')}</TableHead>
                <TableHead className="hidden xl:table-cell">{t('users.createdAt')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{user.name}</p>
                              <p className="truncate text-xs text-muted-foreground" dir="ltr">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ROLE_BADGE[user.role]}>{t(`roles.${user.role}`)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[user.status]}>{statusLabel(user.status)}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{t(`languages.${user.preferredLanguage}`)}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatDateTime(user.lastLoginAt)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground xl:table-cell">
                          {formatDateTime(user.createdAt)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {canEdit(user) ? (
                                <DropdownMenuItem onClick={() => openEdit(user)}>{t('common.edit')}</DropdownMenuItem>
                              ) : null}
                              {canAdminister(user) ? (
                                <>
                                  {user.status === 'ACTIVE' ? (
                                    <DropdownMenuItem onClick={() => requestAction('suspend', user)}>
                                      {t('users.suspendTitle')}
                                    </DropdownMenuItem>
                                  ) : user.status === 'SUSPENDED' ? (
                                    <DropdownMenuItem onClick={() => requestAction('activate', user)}>
                                      {t('users.activateTitle')}
                                    </DropdownMenuItem>
                                  ) : null}
                                  {user.status !== 'ARCHIVED' ? (
                                    <>
                                      <DropdownMenuItem onClick={() => setResetUser(user)}>
                                        {t('users.resetPasswordTitle')}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => requestAction('revoke-sessions', user)}>
                                        {t('users.revokeSessionsTitle')}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => requestAction('archive', user)}
                                      >
                                        {t('users.archiveTitle')}
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState
                            icon={UserRound}
                            title={t('users.noUsers')}
                            description={t('users.noUsersDescription')}
                          />
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.totalPages > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            {t('common.showingXOfY', { count: data.items.length, total: data.total })}
          </p>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
            labels={{
              firstPage: t('common.firstPage'),
              lastPage: t('common.lastPage'),
              prevPage: t('common.previousPage'),
              nextPage: t('common.nextPage'),
            }}
          />
        </div>
      ) : null}

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editingUser}
        key={editingUser?.id ?? 'create'}
      />
      <ResetPasswordDialog user={resetUser} onOpenChange={(open) => !open && setResetUser(null)} />
      <ConfirmActionDialog
        action={confirmAction}
        user={actionUser}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        onDone={() => setActionUser(null)}
      />
    </div>
  );
}
