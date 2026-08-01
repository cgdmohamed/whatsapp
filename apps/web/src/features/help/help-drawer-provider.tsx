import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button } from '@wa/ui';
import { BookOpen } from 'lucide-react';

import { ContextualHelpDrawer } from './contextual-help-drawer';

const FEATURE_BY_ROUTE: Array<[RegExp, string]> = [
  [/^\/$/, 'dashboard'],
  [/^\/contacts/, 'contacts'],
  [/^\/imports/, 'imports'],
  [/^\/lists/, 'lists'],
  [/^\/tags/, 'tags'],
  [/^\/templates/, 'templates'],
  [/^\/campaigns/, 'campaigns'],
  [/^\/inbox/, 'inbox'],
  [/^\/reports/, 'reports'],
  [/^\/users/, 'users'],
  [/^\/settings/, 'settings'],
  [/^\/whatsapp/, 'whatsapp'],
  [/^\/audit-log/, 'audit-log'],
  [/^\/operations/, 'operations'],
  [/^\/integration-logs/, 'integration-logs'],
  [/^\/help/, 'help'],
];

export function featureForPath(pathname: string): string | undefined {
  for (const [pattern, feature] of FEATURE_BY_ROUTE) {
    if (pattern.test(pathname)) {
      return feature;
    }
  }
  return undefined;
}

interface HelpDrawerContextValue {
  openHelp: (featureKey?: string) => void;
}

const HelpDrawerContext = React.createContext<HelpDrawerContextValue>({ openHelp: () => undefined });

export function useHelpDrawer(): HelpDrawerContextValue {
  return React.useContext(HelpDrawerContext);
}

export function HelpDrawerProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = React.useState(false);
  const [featureKey, setFeatureKey] = React.useState<string | undefined>(undefined);

  const openHelp = React.useCallback(
    (next?: string) => {
      setFeatureKey(next ?? featureForPath(pathname));
      setOpen(true);
    },
    [pathname],
  );

  const effectiveFeature = featureKey ?? featureForPath(pathname);

  return (
    <HelpDrawerContext.Provider value={{ openHelp }}>
      {children}
      <ContextualHelpDrawer open={open} onOpenChange={setOpen} route={pathname} featureKey={effectiveFeature} />
    </HelpDrawerContext.Provider>
  );
}

export function ContextualHelpButton({ featureKey, className }: { featureKey?: string; className?: string }) {
  const { t } = useTranslation();
  const { openHelp } = useHelpDrawer();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => openHelp(featureKey)}
      aria-label={t('help.contextHelpAria')}
    >
      <BookOpen className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{t('help.contextHelpTitle')}</span>
    </Button>
  );
}
