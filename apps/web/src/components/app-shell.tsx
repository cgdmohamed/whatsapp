import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BookOpen,
  Contact,
  FileText,
  FileUp,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  Moon,
  PanelLeft,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Tags,
  UserCircle,
  Users,
} from 'lucide-react';
import type { Role } from '@wa/shared';
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarNav,
  type SidebarSection,
} from '@wa/ui';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { getStoredLanguage, setLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { HelpDrawerProvider, useHelpDrawer } from '../features/help/help-drawer-provider';
import { NotificationBell } from '../features/notifications/notification-bell';

const SIDEBAR_STORAGE_KEY = 'wa-sidebar-collapsed';

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');
  const toggle = React.useCallback(() => {
    setCollapsed((value) => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? '0' : '1');
      return !value;
    });
  }, []);
  return { collapsed, toggle };
}

function buildNavSections(role: Role, t: (key: string) => string): SidebarSection[] {
  const main: SidebarSection = {
    label: t('nav.section.main'),
    items: [
      { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
      { to: '/inbox', label: t('nav.inbox'), icon: Inbox },
      { to: '/help', label: t('nav.help'), icon: BookOpen },
    ],
  };

  const messaging: SidebarSection = {
    label: t('nav.section.messaging'),
    items: [
      { to: '/campaigns', label: t('nav.campaigns'), icon: Megaphone },
      { to: '/templates', label: t('nav.templates'), icon: FileText },
    ],
  };

  const audience: SidebarSection = {
    label: t('nav.section.audience'),
    items: [
      { to: '/contacts', label: t('nav.contacts'), icon: Contact },
      { to: '/lists', label: t('nav.lists'), icon: List },
      { to: '/tags', label: t('nav.tags'), icon: Tags },
    ],
  };

  const manage: SidebarSection = {
    label: t('nav.section.manage'),
    items:
      role === 'ADMIN' || role === 'MANAGER'
        ? [
            { to: '/reports', label: t('nav.reports'), icon: BarChart3 },
            { to: '/imports', label: t('nav.imports'), icon: FileUp },
            { to: '/users', label: t('nav.users'), icon: Users },
          ]
        : [],
  };

  const admin: SidebarSection = {
    label: t('nav.section.admin'),
    items:
      role === 'ADMIN'
        ? [
            { to: '/whatsapp', label: t('nav.whatsapp'), icon: MessageCircle },
            { to: '/integration-logs', label: t('nav.integrationLogs'), icon: Activity },
            { to: '/audit-log', label: t('nav.auditLog'), icon: ScrollText },
            { to: '/operations', label: t('nav.operations'), icon: Gauge },
            { to: '/settings/help-center', label: t('nav.helpAdmin'), icon: BookOpen },
            { to: '/settings/email', label: t('nav.emailSettings'), icon: Mail },
            { to: '/settings', label: t('nav.settings'), icon: Settings, end: true },
          ]
        : [],
  };

  const account: SidebarSection = {
    label: t('nav.section.account'),
    items: [{ to: '/profile', label: t('nav.profile'), icon: UserCircle }],
  };

  const sections: SidebarSection[] = [main, messaging, audience];
  if (manage.items.length > 0) {
    sections.push(manage);
  }
  if (admin.items.length > 0) {
    sections.push(admin);
  }
  sections.push(account);
  return sections;
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebarCollapsed();
  const [language, setLanguageState] = React.useState<AppLanguage>(getStoredLanguage());
  const { theme, toggle: toggleTheme } = useTheme();

  if (!user) {
    return null;
  }

  const changeLanguage = (next: AppLanguage) => {
    void setLanguage(next);
    setLanguageState(next);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navSections = buildNavSections(user.role, t);

  const header = (
    <div className="flex items-center gap-3 px-2 py-1">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{t('common.appName')}</p>
        </div>
      ) : null}
    </div>
  );

  const footer = (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle sidebar">
        <PanelLeft className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <HelpDrawerProvider>
      <div className="flex min-h-screen">
        <aside
          className={`sticky top-0 flex h-screen shrink-0 flex-col border-e bg-card transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-60'}`}
        >
          <SidebarNav
            sections={navSections}
            collapsed={collapsed}
            currentPath={location.pathname}
            onNavigate={(to) => navigate(to)}
            header={header}
            footer={footer}
            className={collapsed ? 'w-16' : 'w-60'}
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-background/95 px-6 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">{t('common.appName')}</span>
            </div>
            <div className="flex items-center gap-2">
              <GlobalHelpButton />
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span>{t('languages.' + language)}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <DropdownMenuItem key={lang} onClick={() => changeLanguage(lang)}>
                    {t('languages.' + lang)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-40 truncate text-sm sm:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <UserCircle className="h-4 w-4" />
                  {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/change-password')}>
                  <KeyRound className="h-4 w-4" />
                  {t('common.changePassword')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/help')}>
                  <BookOpen className="h-4 w-4" />
                  {t('nav.help')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleLogout()}>
                  <LogOut className="h-4 w-4" />
                  {t('common.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="h-full">
            <Outlet />
          </div>
        </main>
      </div>
      </div>
    </HelpDrawerProvider>
  );
}

function GlobalHelpButton() {
  const { t } = useTranslation();
  const { openHelp } = useHelpDrawer();
  return (
    <Button variant="ghost" size="icon" onClick={() => openHelp()} aria-label={t('help.helpAria')} title={t('help.helpAria')}>
      <BookOpen className="h-4 w-4" />
    </Button>
  );
}
