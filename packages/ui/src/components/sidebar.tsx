import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  disabled?: boolean;
}

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  items: SidebarNavItem[];
  collapsed?: boolean;
  currentPath: string;
  onNavigate: (to: string) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

function isActive(item: SidebarNavItem, currentPath: string): boolean {
  if (item.end) {
    return currentPath === item.to;
  }
  return currentPath === item.to || currentPath.startsWith(`${item.to}/`);
}

const SidebarNav = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, items, collapsed = false, currentPath, onNavigate, header, footer, ...props }, ref) => {
    return (
      <nav ref={ref} className={cn('flex flex-col gap-4 p-3', className)} {...props}>
        {header}
        <div className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const active = isActive(item, currentPath);
            const content = (
              <button
                type="button"
                key={item.to}
                disabled={item.disabled}
                onClick={() => onNavigate(item.to)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
                  collapsed && 'justify-center px-0',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </button>
            );

            return collapsed ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              content
            );
          })}
        </div>
        {footer}
      </nav>
    );
  },
);
SidebarNav.displayName = 'SidebarNav';

export { SidebarNav };
