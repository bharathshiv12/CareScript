import React from 'react';
import {
  LayoutDashboard,
  FileScan,
  Bot,
  BellRing,
  Settings,
} from 'lucide-react';
import { useCareScript } from '../context/CareScriptContext';
import type { TabId } from '../types/carescript';
import { Logo } from './ui/Logo';

export const NAV_ITEMS: { id: TabId; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'scan', icon: FileScan },
  { id: 'ai-buddy', icon: Bot },
  { id: 'reminders', icon: BellRing },
  { id: 'settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, t, todayStats } = useCareScript();

  const getLabel = (id: TabId) => {
    switch (id) {
      case 'dashboard':
        return t.nav.dashboard;
      case 'scan':
        return t.nav.scan;
      case 'ai-buddy':
        return t.nav.aiBuddy;
      case 'reminders':
        return t.nav.reminders;
      case 'settings':
        return t.nav.settings;
    }
  };

  return (
    <aside
      className="hidden md:flex md:flex-col md:w-64 lg:w-72 md:fixed md:inset-y-0 md:left-0 z-30 select-none"
      style={{ backgroundColor: 'var(--color-sidebar)', color: '#FFFFFF' }}
      aria-label="Primary navigation"
    >
      <div className="p-6 border-b border-white/10">
        <Logo onDark />
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {NAV_ITEMS.map(({ id, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={isActive ? 'page' : undefined}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-left text-base font-medium transition-all"
              style={{
                backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
                color: '#FFFFFF',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span className="flex items-center gap-3.5">
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>{getLabel(id)}</span>
              </span>
              {id === 'reminders' && todayStats.upcoming > 0 && (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: isActive ? '#FFFFFF' : 'var(--color-accent)',
                    color: isActive ? 'var(--color-sidebar)' : '#FFFFFF',
                  }}
                >
                  {todayStats.upcoming}
                </span>
              )}
            </button>
          );
        })}
      </nav>

    </aside>
  );
};
