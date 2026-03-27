'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderKanban,
  MessageCircle,
  GitBranch,
  RefreshCw,
  DollarSign,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { CauldronLogo } from './CauldronLogo';
import { cn } from '@/lib/utils';

const SIDEBAR_STORAGE_KEY = 'cauldron-sidebar-collapsed';

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

interface NavSidebarProps {
  projectId?: string;
  unreadCount?: number;
}

export function NavSidebar({ projectId, unreadCount = 0 }: NavSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === 'true');
    }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
  }

  const globalNavItems: NavItem[] = [
    { icon: FolderKanban, label: 'Projects', href: '/projects' },
  ];

  const projectNavItems: NavItem[] = projectId
    ? [
        { icon: MessageCircle, label: 'Interview', href: `/projects/${projectId}/interview` },
        { icon: GitBranch, label: 'Execution', href: `/projects/${projectId}/execution` },
        { icon: RefreshCw, label: 'Evolution', href: `/projects/${projectId}/evolution` },
        { icon: DollarSign, label: 'Costs', href: `/projects/${projectId}/costs` },
        { icon: Settings, label: 'Settings', href: `/projects/${projectId}/settings` },
      ]
    : [];

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/');
  }

  // Prevent hydration mismatch: render collapsed=false server-side
  const isCollapsed = mounted ? collapsed : false;

  return (
    <aside
      className="relative flex flex-col flex-shrink-0 h-screen overflow-hidden transition-[width]"
      style={{
        width: isCollapsed ? '56px' : '240px',
        background: '#111820',
        borderRight: '1px solid #1a2330',
        transition: 'width 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    >
      {/* Header: Logo + wordmark */}
      <div
        className="flex items-center gap-3 px-3 overflow-hidden"
        style={{ height: '56px', borderBottom: '1px solid #1a2330', flexShrink: 0 }}
      >
        <div className="flex-shrink-0">
          <CauldronLogo size={28} />
        </div>
        {!isCollapsed && (
          <span
            className="text-xs font-semibold uppercase tracking-widest text-primary whitespace-nowrap overflow-hidden"
            style={{ letterSpacing: '0.15em', color: '#c8d6e5' }}
          >
            CAULDRON
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3" aria-label="Main navigation">
        {/* Global nav items */}
        <ul className="space-y-1 px-2">
          {globalNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={isCollapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 rounded-md transition-colors',
                    'relative overflow-hidden',
                    active
                      ? 'text-[#00d4aa]'
                      : 'text-[#6b8399] hover:bg-[#1a2330] hover:text-[#c8d6e5]',
                  )}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-[#00d4aa]"
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={18} className="flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap overflow-hidden">
                      {item.label}
                    </span>
                  )}
                  {/* Unread badge on Projects icon when there are escalations */}
                  {item.href === '/projects' && unreadCount > 0 && (
                    <span
                      className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center"
                      style={{ background: '#f5a623', color: '#0a0f14' }}
                      aria-label={`${unreadCount} unread escalation${unreadCount === 1 ? '' : 's'}`}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Project-level nav items */}
        {projectNavItems.length > 0 && (
          <>
            {!isCollapsed && (
              <div
                className="mx-4 my-3"
                style={{ borderTop: '1px solid #1a2330' }}
                aria-hidden="true"
              />
            )}
            <ul className="space-y-1 px-2">
              {projectNavItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={isCollapsed ? item.label : undefined}
                      aria-label={item.label}
                      className={cn(
                        'flex items-center gap-3 px-2 py-2 rounded-md transition-colors',
                        'relative overflow-hidden',
                        active
                          ? 'text-[#00d4aa]'
                          : 'text-[#6b8399] hover:bg-[#1a2330] hover:text-[#c8d6e5]',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-[#00d4aa]"
                          aria-hidden="true"
                        />
                      )}
                      <Icon size={18} className="flex-shrink-0" />
                      {!isCollapsed && (
                        <span className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap overflow-hidden">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <div
        className="flex items-center justify-center p-2"
        style={{ borderTop: '1px solid #1a2330', flexShrink: 0 }}
      >
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center w-8 h-8 rounded-md text-[#6b8399] hover:bg-[#1a2330] hover:text-[#c8d6e5] transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
