import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  disabled?: boolean;
}

export interface SidebarSection {
  label?: string;
  items: SidebarNavItem[];
}

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  sections: SidebarSection[];
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

function useCustomScrollbar() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const thumbRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  const update = React.useCallback(() => {
    const el = containerRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!el || !thumb) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const canScroll = scrollHeight > clientHeight + 1;
    setVisible(canScroll);
    if (!canScroll) return;
    const trackHeight = track?.clientHeight ?? clientHeight;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    thumb.style.height = `${thumbHeight}px`;
    const maxTrack = trackHeight - thumbHeight;
    const maxScroll = scrollHeight - clientHeight;
    const top = maxScroll > 0 ? (scrollTop / maxScroll) * maxTrack : 0;
    thumb.style.transform = `translateY(${top}px)`;
  }, []);

  React.useEffect(() => {
    update();
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [update]);

  const onThumbPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!el || !thumb) return;
    event.preventDefault();
    const startY = event.clientY;
    const startScrollTop = el.scrollTop;
    const trackHeight = track?.clientHeight ?? el.clientHeight;
    const thumbHeight = thumb.getBoundingClientRect().height;
    const maxTrack = trackHeight - thumbHeight;
    const maxScroll = el.scrollHeight - el.clientHeight;

    const onMove = (moveEvent: PointerEvent) => {
      if (maxScroll > 0 && maxTrack > 0) {
        const delta = moveEvent.clientY - startY;
        el.scrollTop = startScrollTop + (delta / maxTrack) * maxScroll;
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  return { containerRef, trackRef, thumbRef, visible, onThumbPointerDown };
}

const SidebarNav = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, sections, collapsed = false, currentPath, onNavigate, header, footer, ...props }, ref) => {
    const tooltipSide =
      typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'left' : 'right';
    const { containerRef, trackRef, thumbRef, visible, onThumbPointerDown } = useCustomScrollbar();

    return (
      <TooltipProvider delayDuration={0}>
        <nav ref={ref} className={cn('flex h-full flex-col gap-4 p-3', className)} {...props}>
          {header}
          <div
            ref={containerRef}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex flex-col gap-5 pb-2">
              {sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="flex flex-col gap-1">
                  {section.label && !collapsed ? (
                    <p className="px-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.label}
                    </p>
                  ) : null}
                  {section.items.map((item) => {
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
                        <TooltipContent side={tooltipSide}>{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      content
                    );
                  })}
                </div>
              ))}
            </div>

            <div
              ref={trackRef}
              className={cn(
                'pointer-events-none absolute bottom-2 end-1 top-2 w-1.5 transition-opacity duration-200',
                visible ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden="true"
            >
              <div
                ref={thumbRef}
                onPointerDown={onThumbPointerDown}
                className="pointer-events-auto w-full cursor-pointer rounded-full bg-foreground/20 transition-colors hover:bg-foreground/35 active:bg-foreground/45"
              />
            </div>
          </div>
          {footer}
        </nav>
      </TooltipProvider>
    );
  },
);
SidebarNav.displayName = 'SidebarNav';

export { SidebarNav };
