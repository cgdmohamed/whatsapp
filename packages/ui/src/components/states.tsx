import * as React from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';

import { cn } from '../lib/utils';
import { Button } from './button';
import { Spinner } from './spinner';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon = AlertTriangle, title, description, actionLabel, onAction, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center', className)}
      {...props}
    >
      <div className="rounded-full bg-muted p-3">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="mt-2 text-base font-semibold">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  loading?: boolean;
}

const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ className, title, description, retryLabel, onRetry, loading, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center', className)}
      {...props}
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="mt-2 text-base font-semibold">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {retryLabel && onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry} disabled={loading}>
          {loading ? <Spinner size="sm" /> : null}
          {retryLabel}
        </Button>
      ) : null}
    </div>
  ),
);
ErrorState.displayName = 'ErrorState';

export { EmptyState, ErrorState };
