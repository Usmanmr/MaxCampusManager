import React from 'react';
import {
  BookOpen,
  Building2,
  CheckSquare,
  ClipboardList,
  FileBarChart2,
  LayoutDashboard,
  Moon,
  ShieldAlert,
  Sun,
  Users,
} from 'lucide-react';
import { Campus, RoleAssignment, User } from '../shared/types';
import { STRINGS } from '../shared/strings';

export type NavTabId =
  | 'dashboard'
  | 'take-attendance'
  | 'reports'
  | 'academics'
  | 'people'
  | 'governance';

interface HeaderAndSidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  campuses: Campus[];
  activeCampusId: string;
  onSelectCampus: (campusId: string) => void;
  currentUser: User;
  currentUserRoles: RoleAssignment[];
  allUsers: User[];
  onSelectUser: (userId: string) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  pendingCorrectionsCount: number;
  pendingVerificationsCount: number;
}

export const HeaderAndSidebar: React.FC<HeaderAndSidebarProps> = ({
  activeTab,
  onSelectTab,
  campuses,
  activeCampusId,
  onSelectCampus,
  currentUser,
  currentUserRoles,
  allUsers,
  onSelectUser,
  darkMode,
  onToggleDarkMode,
  pendingCorrectionsCount,
  pendingVerificationsCount,
}) => {
  const activeCampus = campuses.find((c) => c.id === activeCampusId) || campuses[0];

  const navItems: Array<{
    id: NavTabId;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }> = [
    {
      id: 'dashboard',
      label: STRINGS.nav.dashboard,
      shortLabel: 'Home',
      icon: LayoutDashboard,
    },
    {
      id: 'take-attendance',
      label: STRINGS.nav.takeAttendance,
      shortLabel: 'Mark',
      icon: CheckSquare,
    },
    {
      id: 'reports',
      label: STRINGS.nav.reports,
      shortLabel: 'Reports',
      icon: FileBarChart2,
    },
    {
      id: 'academics',
      label: STRINGS.nav.academics,
      shortLabel: 'Academics',
      icon: BookOpen,
    },
    {
      id: 'people',
      label: STRINGS.nav.people,
      shortLabel: 'People',
      icon: Users,
      count: pendingVerificationsCount > 0 ? pendingVerificationsCount : undefined,
    },
    {
      id: 'governance',
      label: STRINGS.nav.governance,
      shortLabel: 'Controls',
      icon: ShieldAlert,
      count: pendingCorrectionsCount > 0 ? pendingCorrectionsCount : undefined,
    },
  ];

  const primaryRoleLabel =
    currentUserRoles.find((r) => r.role === 'SUPER_ADMIN')
      ? 'Super Admin (All Campuses)'
      : currentUserRoles
          .filter((r) => !r.campusId || r.campusId === activeCampusId)
          .map((r) => r.role.replace('_', ' '))
          .join(' / ') || 'Staff';

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside
        aria-label="Primary Sidebar Navigation"
        className="no-print hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30"
      >
        {/* Brand Identity */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-bold text-sm tracking-tight shrink-0">
              AB
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {STRINGS.brandName}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {activeCampus ? `${activeCampus.code} · ${activeCampus.termType === 'annual' ? 'Annual' : 'Semester'}` : 'Multi-Campus Core'}
              </div>
            </div>
          </div>
        </div>

        {/* Campus Switcher in Sidebar */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
          <label
            htmlFor="sidebar-campus-select"
            className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Active Institution (Campus)
          </label>
          <div className="relative">
            <select
              id="sidebar-campus-select"
              value={activeCampusId}
              onChange={(e) => onSelectCampus(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-400"
            >
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Module Registry Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Module Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && (
                  <span
                    className={`ml-2 font-mono-tabular text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      isActive
                        ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Role & Persona Switcher at bottom of sidebar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
          <label
            htmlFor="role-persona-select"
            className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
          >
            Signed-In Account (Role Test)
          </label>
          <select
            id="role-persona-select"
            value={currentUser.id}
            onChange={(e) => onSelectUser(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-400"
          >
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate" title={primaryRoleLabel}>
              {primaryRoleLabel}
            </span>
            <span className="shrink-0 font-mono-tabular">PKT</span>
          </div>
        </div>
      </aside>

      {/* Top Header Bar (Follows 3-Zone Top Bar Contract) */}
      <header className="no-print sticky top-0 z-20 md:pl-64 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Zone 1: Contextual Campus & Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 hidden sm:block" />
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {activeCampus ? activeCampus.name : STRINGS.brandName}
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">
              /
            </span>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 truncate hidden sm:inline">
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          {/* Zone 2: Mobile Campus & Role Quick Pickers */}
          <div className="flex md:hidden items-center gap-2">
            <select
              aria-label="Select Campus"
              value={activeCampusId}
              onChange={(e) => onSelectCampus(e.target.value)}
              className="px-2 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded border border-slate-300 dark:border-slate-700"
            >
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
            <select
              aria-label="Switch Active User Role"
              value={currentUser.id}
              onChange={(e) => onSelectUser(e.target.value)}
              className="max-w-[125px] px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded border border-slate-300 dark:border-slate-700 truncate"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Zone 3: Primary Action & Dark Mode Toggle */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('take-attendance')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Take Attendance</span>
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-2 rounded-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (<= 15% mobile viewport height, 44px+ touch targets) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-6 h-14"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[56px]">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
