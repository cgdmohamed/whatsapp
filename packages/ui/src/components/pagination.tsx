import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { cn } from '../lib/utils';
import { Button } from './button';

export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  labels?: {
    prevPage: string;
    nextPage: string;
    firstPage: string;
    lastPage: string;
  };
}

function range(start: number, end: number): number[] {
  const length = Math.max(0, end - start + 1);
  return Array.from({ length }, (_, index) => start + index);
}

function getVisiblePages(page: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) {
    return range(1, totalPages);
  }
  const pages = new Set<number | '…'>([1, totalPages]);
  for (const offset of [-2, -1, 0, 1, 2]) {
    const candidate = page + offset;
    if (candidate >= 2 && candidate <= totalPages - 1) {
      pages.add(candidate);
    }
  }
  const sorted = [...pages].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : 0));
  const result: Array<number | '…'> = [];
  let previous: number | '…' | null = null;
  for (const value of sorted) {
    if (
      previous !== null &&
      typeof previous === 'number' &&
      typeof value === 'number' &&
      value - previous > 1
    ) {
      result.push('…');
    }
    result.push(value);
    previous = value;
  }
  return result;
}

const Pagination = React.forwardRef<HTMLDivElement, PaginationProps>(
  ({ className, page, totalPages, onPageChange, labels, ...props }, ref) => {
    if (totalPages <= 0) {
      return null;
    }

    const first = '«';
    const last = '»';
    const prev = '‹';
    const next = '›';

    const navButton =
      'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 rtl:[&>svg]:rotate-180';

    return (
      <nav
        ref={ref}
        className={cn('flex flex-wrap items-center gap-1', className)}
        aria-label="pagination"
        {...props}
      >
        <Button
          variant="ghost"
          size="icon"
          className={navButton}
          aria-label={labels?.firstPage ?? 'First page'}
          title={labels?.firstPage ?? 'First page'}
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft className="h-4 w-4" />
          <span className="sr-only">{first}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={navButton}
          aria-label={labels?.prevPage ?? 'Previous page'}
          title={labels?.prevPage ?? 'Previous page'}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">{prev}</span>
        </Button>
        {getVisiblePages(page, totalPages).map((value, index) =>
          value === '…' ? (
            <span key={`ellipsis-${index}`} className="px-1 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={value}
              variant={value === page ? 'default' : 'ghost'}
              size="icon"
              className={navButton}
              aria-current={value === page ? 'page' : undefined}
              onClick={() => onPageChange(value)}
            >
              {value}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon"
          className={navButton}
          aria-label={labels?.nextPage ?? 'Next page'}
          title={labels?.nextPage ?? 'Next page'}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">{next}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={navButton}
          aria-label={labels?.lastPage ?? 'Last page'}
          title={labels?.lastPage ?? 'Last page'}
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight className="h-4 w-4" />
          <span className="sr-only">{last}</span>
        </Button>
      </nav>
    );
  },
);
Pagination.displayName = 'Pagination';

export { Pagination };
