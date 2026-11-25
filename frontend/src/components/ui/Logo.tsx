import React from 'react';

interface LogoProps {
  compact?: boolean;
  onDark?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ compact = false, onDark = true }) => {
  return (
    <div className="flex items-center gap-3 select-none">
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        className="w-10 h-10 shrink-0 rounded-xl drop-shadow-sm"
      />
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
