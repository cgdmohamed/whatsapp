import { useTranslation } from 'react-i18next';
import type { ContactListDto } from '@wa/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@wa/ui';
import { UserRound } from 'lucide-react';

import { useListMembers } from '../contacts/api';

interface ListMembersDialogProps {
  list: ContactListDto;
  onOpenChange: (open: boolean) => void;
}

export function ListMembersDialog({ list, onOpenChange }: ListMembersDialogProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useListMembers(list.id);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{list.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <UserRound className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('lists.noMembers')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('contacts.contact')}</TableHead>
                  <TableHead>{t('contacts.optInStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {(contact.displayName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')) ||
                            t('contacts.unnamed')}
                        </p>
                        <p className="truncate text-xs text-muted-foreground" dir="ltr">
                          {contact.phoneE164}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{t(`contacts.optIn.${contact.optInStatus}`)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
