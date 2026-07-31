import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  onNavigate?: (href: string) => void;
}

const Breadcrumbs = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  ({ className, items, onNavigate, ...props }, ref) => {
    return (
      <nav ref={ref} aria-label="Breadcrumb" className={cn('flex items-center text-sm', className)} {...props}>
        <ol className="flex flex-wrap items-center gap-0">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={`${item.label}-${index}`} className="flex items-center">
                {index > 0 ? (
                  <span
                    className="mx-1 flex items-center text-muted-foreground/60"
                    aria-hidden="true"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 ltr:hidden rtl:block" />
                    <ChevronRight className="h-3.5 w-3.5 ltr:block rtl:hidden" />
                  </span>
                ) : null}
                {isLast ? (
                  <span aria-current="page" className="font-medium text-foreground">
                    {item.label}
                  </span>
                ) : item.href && onNavigate ? (
                  <a
                    href={item.href}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(item.href!);
                    }}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{item.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  },
);
Breadcrumbs.displayName = 'Breadcrumbs';

export { Breadcrumbs };
