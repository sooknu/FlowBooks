import { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FolderKanban, CalendarDays,
  FileText, Receipt, CreditCard, FileCheck,
  Users, Package, Wallet,
  BarChart3,
  Settings, Shield, ScrollText,
  LogOut, User, UserPlus, ChevronsLeft, Menu, X, Bell, Banknote, ChevronRight,
  Sun, Moon, SunMoon,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn, timeAgo } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';

const NAV_ITEMS = [
  { type: 'item', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { type: 'item', path: '/projects', label: 'Projects', icon: FolderKanban, permission: 'view_projects' },
  { type: 'item', path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { type: 'section', label: 'Sales', collapsible: true },
  { type: 'item', path: '/quotes', label: 'Quotes', icon: FileText },
  { type: 'item', path: '/invoices', label: 'Invoices', icon: Receipt },
  { type: 'item', path: '/payments', label: 'Payments', icon: CreditCard },
  { type: 'item', path: '/contracts', label: 'Contracts', icon: FileCheck },
  { type: 'section', label: 'Management', collapsible: true },
  { type: 'item', path: '/clients', label: 'Clients', icon: Users },
  { type: 'item', path: '/services', label: 'Services', icon: Package },
  { type: 'section', label: 'Finance', collapsible: true },
  { type: 'item', path: '/expenses', label: 'Expenses', icon: Wallet, permission: 'view_expenses' },
  { type: 'item', path: '/finance', label: 'Finance', icon: Banknote, permission: 'view_advances' },
  { type: 'item', path: '/salary', label: 'Salary', icon: Wallet, permission: 'view_salary' },
  { type: 'item', path: '/reports', label: 'Reports', icon: BarChart3 },
];

const TEAM_ITEM = { type: 'item', path: '/team', label: 'Team', icon: Shield };
const PERMISSIONS_ITEM = { type: 'item', path: '/permissions', label: 'Permissions', icon: Shield };
const ACTIVITY_ITEM = { type: 'item', path: '/activity', label: 'Activity', icon: ScrollText };
const SETTINGS_ITEM = { type: 'item', path: '/settings', label: 'Settings', icon: Settings };
const SYSTEM_SECTION = { type: 'section', label: 'System', collapsible: true };

const CREW_ITEMS = [
  { type: 'item', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { type: 'item', path: '/projects', label: 'Projects', icon: FolderKanban },
  { type: 'item', path: '/calendar', label: 'Calendar', icon: CalendarDays },
];

// All possible nav items for label lookup (including non-role-specific)
const ALL_NAV_ITEMS = [
  ...NAV_ITEMS, TEAM_ITEM, PERMISSIONS_ITEM, ACTIVITY_ITEM, SETTINGS_ITEM,
  { type: 'item', path: '/profile', label: 'Profile', icon: User },
  { type: 'item', path: '/finance', label: 'Finance', icon: Banknote },
  { type: 'item', path: '/salary', label: 'Salary', icon: Wallet },
];

const NOTIF_TYPE_CONFIG = {
  quote_approved: { icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-50', route: '/quotes' },
  payment_received: { icon: CreditCard, color: 'text-blue-500', bg: 'bg-blue-50', route: '/invoices' },
  project_booked: { icon: FolderKanban, color: 'text-indigo-500', bg: 'bg-indigo-50', route: '/projects' },
  advance_created: { icon: Banknote, color: 'text-amber-500', bg: 'bg-amber-50', route: '/finance' },
  salary_accrued: { icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-50', route: '/salary' },
  new_user_signup: { icon: UserPlus, color: 'text-amber-500', bg: 'bg-amber-50', route: '/team?tab=accounts' },
};

const Sidebar = ({ isAdmin, isPrivileged, teamRole, appName, headerLogoUrl, headerLogoDarkUrl, headerLogoSize, faviconUrl, userProfile, user, onSignOut, advancesEnabled, salaryEnabled, can }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState(() => new Set(['Sales', 'Management', 'Finance', 'System']));
  const { notifications: notifs, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const { isImpersonating, stopImpersonating } = useAuth();
  const { theme, resolvedTheme, cycleTheme } = useTheme();
  const effectiveHeaderLogo = resolvedTheme === 'dark' ? (headerLogoDarkUrl || headerLogoUrl) : headerLogoUrl;

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock all scrolling when mobile sidebar is open (iOS-proof)
  useEffect(() => {
    if (mobileOpen) {
      const scrollY = window.scrollY;
      const body = document.body;
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.overflow = 'hidden';
      return () => {
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileOpen]);

  // Crew: Dashboard + Projects + enabled finance features
  // Others: full nav filtered by permission, + Team/Settings based on permissions
  const isCrew = teamRole && !isPrivileged;
  const items = isCrew
    ? [
        ...CREW_ITEMS,
        ...(advancesEnabled || salaryEnabled ? [{ type: 'section', label: 'Finance', collapsible: true }] : []),
        ...(advancesEnabled ? [{ type: 'item', path: '/finance', label: 'Advances', icon: Banknote }] : []),
        ...(salaryEnabled ? [{ type: 'item', path: '/salary', label: 'Salary', icon: Wallet }] : []),
      ]
    : [
        ...NAV_ITEMS.filter(i => !i.permission || can(i.permission)),
        ...(can('view_team') || can('access_settings') || can('view_activity_log') ? [SYSTEM_SECTION] : []),
        ...(can('view_team') ? [TEAM_ITEM] : []),
        ...(can('manage_permissions') ? [PERMISSIONS_ITEM] : []),
        ...(can('view_activity_log') ? [ACTIVITY_ITEM] : []),
        ...(can('access_settings') ? [SETTINGS_ITEM] : []),
      ];

  // Derive current page label from pathname
  const currentPageLabel = useMemo(() => {
    const path = location.pathname;
    const exact = ALL_NAV_ITEMS.find(i => i.type === 'item' && i.path === path);
    if (exact) return exact.label;
    const prefix = ALL_NAV_ITEMS.find(i => i.type === 'item' && path.startsWith(i.path + '/'));
    if (prefix) return prefix.label;
    return appName || '';
  }, [location.pathname, appName]);

  const displayName = userProfile?.displayName || userProfile?.display_name || user?.email || '';
  const initials = displayName ? displayName.substring(0, 2).toUpperCase() : '??';

  const toggleSection = (label) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderNavItems = (navItems, isMobile) => {
    let currentSection = null;
    return navItems.map((item, i) => {
      if (item.type === 'section') {
        currentSection = item.label;
        const isCollapsible = isMobile && item.collapsible;
        const isSectionCollapsed = isCollapsible && collapsedSections.has(item.label);
        return (
          <div
            key={`section-${i}`}
            className={cn(
              "sidebar-section-label",
              collapsed && "lg:hidden",
              isCollapsible && "cursor-pointer select-none flex items-center justify-between"
            )}
            onClick={isCollapsible ? () => toggleSection(item.label) : undefined}
          >
            <span>{item.label}</span>
            {isCollapsible && (
              <ChevronRight className={cn("w-3 h-3 transition-transform duration-200", !isSectionCollapsed && "rotate-90")} />
            )}
          </div>
        );
      }

      // Hide items in collapsed sections (mobile only)
      if (isMobile && currentSection && collapsedSections.has(currentSection)) {
        return null;
      }

      const Icon = item.icon;
      return (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={() => setMobileOpen(false)}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) => cn(
            "sidebar-item group",
            isActive && "sidebar-item--active"
          )}
        >
          <Icon className="w-[18px] h-[18px] flex-shrink-0" />
          <span className={cn("sidebar-label truncate text-[17px] lg:text-[14px]", collapsed && "lg:hidden")}>{item.label}</span>
        </NavLink>
      );
    });
  };

  // ── Notification popover content (shared between desktop & mobile) ──
  const notifList = (
    <>
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-surface-200/80">
        <span className="text-[13px] font-semibold text-surface-800 tracking-tight">Notifications</span>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium tracking-tight"
            >
              Mark all read
            </button>
          )}
          {notifs.length > 0 && (
            <button
              onClick={() => clearAll.mutate()}
              className="text-[11px] text-surface-400 hover:text-red-500 font-medium tracking-tight"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {notifs.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-surface-400">
            No notifications yet
          </div>
        ) : (
          notifs.map(n => {
            const cfg = NOTIF_TYPE_CONFIG[n.type] || NOTIF_TYPE_CONFIG.quote_approved;
            const NIcon = cfg.icon;
            return (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  if (n.entityType === 'project' && n.entityId) {
                    navigate(`/projects/${n.entityId}`);
                  } else if (cfg.route) {
                    navigate(cfg.route);
                  }
                  setMobileOpen(false);
                }}
                className={cn(
                  "w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-surface-50 transition-colors border-b border-surface-100/80 last:border-b-0",
                  !n.isRead && "bg-blue-50/30"
                )}
              >
                <div className={cn("mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center", cfg.bg)}>
                  <NIcon className={cn("w-3.5 h-3.5", cfg.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-surface-800 truncate">{n.title}</span>
                    {!n.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-[12px] text-surface-500 truncate">{n.message}</p>
                  <span className="text-[11px] text-surface-400">{timeAgo(n.createdAt)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  // ── Desktop sidebar header ──
  const sidebarContent = (isMobile = false) => (
    <>
      {/* Logo area */}
      <div className={cn(
        "flex items-center pt-5 pb-4 lg:py-5 px-5 flex-shrink-0",
        collapsed && "lg:px-0 lg:justify-center"
      )}>
        <NavLink to="/dashboard" className={cn("flex items-center min-w-0", collapsed && "lg:justify-center lg:w-full")}>
          {collapsed && faviconUrl ? (
            <img src={faviconUrl} alt="Logo" className="w-6 h-6 object-contain flex-shrink-0 hidden lg:block" />
          ) : null}
          {effectiveHeaderLogo ? (
            <img src={effectiveHeaderLogo} alt="Logo" className={cn("object-contain flex-shrink-0", collapsed && "lg:hidden")} style={{ height: `${parseInt(headerLogoSize, 10) || 28}px` }} />
          ) : (
            <div className={cn("w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0", collapsed && faviconUrl && "lg:hidden")}>
              <span className="text-[#C8C6C2] text-xs font-bold">{(appName || 'Q')[0]}</span>
            </div>
          )}
        </NavLink>
      </div>

      {/* User bar — avatar + name + bell + collapse (desktop only, mobile has sticky header) */}
      {!isMobile && <div className={cn(
        "hidden lg:flex items-center gap-1 mx-2 mb-2 px-1.5 py-1.5 rounded-lg bg-surface-50/80 flex-shrink-0",
        collapsed && "lg:flex-col lg:mx-1 lg:px-1 lg:gap-1.5"
      )}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "flex items-center gap-2 min-w-0 flex-1 px-1 py-0.5 rounded-md hover:bg-white/60 dark:hover:bg-white/10 transition-colors",
              collapsed && "lg:p-1 lg:flex-none lg:justify-center"
            )}>
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarImage src={userProfile?.avatarUrl || userProfile?.avatar_url} alt="User" />
                <AvatarFallback className="text-[9px] font-semibold bg-gradient-to-br from-blue-500 to-indigo-600 text-[#C8C6C2]">{initials}</AvatarFallback>
              </Avatar>
              <span className={cn("text-[12.5px] font-medium text-surface-700 truncate", collapsed && "lg:hidden")}>{displayName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="w-56">
            <DropdownMenuItem onClick={() => { navigate('/profile'); setMobileOpen(false); }} className="cursor-pointer">
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className={cn("flex items-center gap-0.5 flex-shrink-0", collapsed && "lg:flex-col")}>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="relative flex items-center justify-center w-7 h-7 rounded-md text-surface-400 hover:text-surface-700 hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
                title="Notifications"
              >
                <Bell className="w-[15px] h-[15px]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-[#C8C6C2] text-[8px] font-bold leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-80 p-0">
              {notifList}
            </PopoverContent>
          </Popover>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-surface-400 hover:text-surface-700 hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronsLeft className={cn("w-3.5 h-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
          </button>
        </div>
      </div>}

      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex-shrink-0">
          <p className="text-[11px] font-semibold text-amber-700 leading-tight">Viewing as {displayName}</p>
          <button
            onClick={stopImpersonating}
            className="mt-1 text-[11px] font-semibold text-amber-600 hover:text-amber-800 underline underline-offset-2"
          >
            Exit impersonation
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-1 pb-5 lg:pb-1 px-2 space-y-px sidebar-scrollable">
        {renderNavItems(items, isMobile)}
      </nav>

      {/* Theme toggle */}
      <div className={cn("flex-shrink-0 px-2 pb-3 pt-1", collapsed && "lg:px-1")}>
        <button
          onClick={cycleTheme}
          title={`Theme: ${theme === 'system' ? 'Auto' : theme}`}
          className={cn(
            "flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover transition-colors text-[13px]",
            collapsed && "lg:justify-center lg:px-0"
          )}
        >
          {theme === 'light' && <Sun className="w-4 h-4 flex-shrink-0" />}
          {theme === 'dark' && <Moon className="w-4 h-4 flex-shrink-0" />}
          {theme === 'system' && <SunMoon className="w-4 h-4 flex-shrink-0" />}
          <span className={cn("truncate", collapsed && "lg:hidden")}>
            {theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Auto'}
          </span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ── Mobile sticky top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40">
          {isImpersonating && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 border-b border-amber-200">
              <span className="text-[11px] font-semibold text-amber-700">Viewing as {displayName}</span>
              <button onClick={stopImpersonating} className="text-[11px] font-semibold text-amber-600 hover:text-amber-800 underline underline-offset-2">Exit</button>
            </div>
          )}
          <div className="flex items-center justify-between h-[53px] px-3 bg-[rgb(var(--glass-bg)_/_0.9)] backdrop-blur-xl border-b border-surface-300 shadow-[0_1px_4px_rgba(0,0,0,0.1)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => setMobileOpen(true)}
                className="p-1 -ml-0.5 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100/80 transition-colors flex-shrink-0"
                aria-label="Open menu"
              >
                <Menu className="w-[23px] h-[23px]" />
              </button>
              {effectiveHeaderLogo ? (
                <NavLink to="/dashboard" className="flex-shrink-0">
                  <img src={effectiveHeaderLogo} alt="Home" className="object-contain" style={{ height: '22px' }} />
                </NavLink>
              ) : faviconUrl ? (
                <NavLink to="/dashboard" className="flex-shrink-0">
                  <img src={faviconUrl} alt="Home" className="w-5 h-5 object-contain" />
                </NavLink>
              ) : null}
              <div className="w-px h-4 bg-surface-200/80" />
              <span className="text-[13px] font-semibold text-surface-800 truncate tracking-tight">{currentPageLabel}</span>
            </div>

            <div className="flex items-center gap-0.5">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="relative p-1.5 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100/80 transition-colors flex-shrink-0" title="Notifications">
                    <Bell className="w-[22px] h-[22px]" />
                    {unreadCount > 0 && (
                      <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[13px] h-3 px-0.5 rounded-full bg-red-500 text-[#C8C6C2] text-[7px] font-bold leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-80 p-0">
                  {notifList}
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-0.5 rounded-lg hover:bg-surface-100/80 transition-colors flex-shrink-0">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={userProfile?.avatarUrl || userProfile?.avatar_url} alt="User" />
                      <AvatarFallback className="text-[8px] font-semibold bg-gradient-to-br from-blue-500 to-indigo-600 text-[#C8C6C2]">{initials}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSignOut} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
      </div>

      {/* Mobile overlay + slide-in sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 lg:hidden touch-none"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="sidebar fixed top-0 left-0 bottom-0 z-50 w-[220px] flex flex-col lg:hidden overscroll-contain"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3.5 right-3 p-1 rounded-md text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              {sidebarContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className={cn(
        "sidebar hidden lg:flex flex-col flex-shrink-0 transition-all duration-200",
        collapsed ? "w-[64px]" : "w-[200px]"
      )}>
        {sidebarContent(false)}
      </aside>
    </>
  );
};

export default Sidebar;
