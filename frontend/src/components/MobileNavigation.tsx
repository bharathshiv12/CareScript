import React from 'react';
import { useCareScript } from '../context/CareScriptContext';
import type { TabId } from '../types/carescript';
import { NAV_ITEMS } from './Sidebar';

export const MobileNavigation: React.FC = () => {
  const { activeTab, setActiveTab, t, todayStats } = useCareScript();

  const getShortLabel = (id: TabId) => {
    switch (id) {
      case 'dashboard':
        return t.nav.dashboard;
      case 'scan':
        return t.nav.scan.split(' ')[0];
      case 'ai-buddy':
        return t.nav.aiBuddy;
      case 'reminders':
        return t.nav.reminders;
      case 'settings':
        return t.nav.settings;
    }
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 px-1 py-1.5"
      style={{ backgroundColor: 'var(--color-sidebar)', color: '#FFFFFF' }}
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-5 gap-1">
        {NAV_ITEMS.map(({ id, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[11px] font-semibold transition-colors min-h-[54px]"
              style={{
                backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
                color: '#FFFFFF',
              }}
            >
              <Icon className="w-5 h-5 mb-1" aria-hidden="true" />
              <span className="truncate max-w-full">{getShortLabel(id)}</span>
              {id === 'reminders' && todayStats.upcoming > 0 && (
                <span
                  className="absolute top-1.5 right-3 w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
