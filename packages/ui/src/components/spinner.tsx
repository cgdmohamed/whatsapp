import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from '../lib/utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', label, ...props }, ref) => {
    const sizeClass = {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
    }[size];

    return (
      <div
        ref={ref}
        role="status"
        aria-label={label ?? 'Loading'}
        className={cn('flex items-center justify-center', className)}
        {...props}
      >
        <Loader2 className={cn('animate-spin text-muted-foreground', sizeClass)} />
      </div>
    );
  },
);
Spinner.displayName = 'Spinner';

export { Spinner };
