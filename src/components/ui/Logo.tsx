import React from 'react';
import { Pill } from 'lucide-react';

interface LogoProps {
  compact?: boolean;
  onDark?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ compact = false, onDark = true }) => {
  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className="relative flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: '#FFFFFF',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
        }}
      >
        <Pill className="w-5 h-5" aria-hidden="true" />
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2"
          style={{
            backgroundColor: 'var(--color-purple)',
            borderColor: onDark ? 'var(--color-sidebar)' : 'var(--color-surface)',
          }}
          aria-hidden="true"
        />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div
            className="text-lg font-bold tracking-tight"
            style={{ color: onDark ? '#FFFFFF' : 'var(--color-text)' }}
          >
            Care<span style={{ color: onDark ? '#12B8AC' : 'var(--color-primary)' }}>Script</span>
          </div>
          <div
            className="text-xs opacity-90"
            style={{ color: onDark ? '#C5ECE9' : 'var(--color-text-muted)' }}
          >
            Medication Companion
          </div>
        </div>
      )}
    </div>
  );
};
