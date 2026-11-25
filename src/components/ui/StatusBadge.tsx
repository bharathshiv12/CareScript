import React from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { DoseStatus } from '../../types/carescript';
import { useCareScript } from '../../context/CareScriptContext';

interface StatusBadgeProps {
  status: DoseStatus;
  takenTimeLabel?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, takenTimeLabel }) => {
  const { t } = useCareScript();

  if (status === 'taken') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
        style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}
      >
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        {t.common.taken}
        {takenTimeLabel ? ` · ${takenTimeLabel}` : ''}
      </span>
    );
  }

  if (status === 'missed') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
        style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
      >
        <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
        {t.common.missed}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: 'var(--color-upcoming-bg)', color: 'var(--color-upcoming)' }}
    >
      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
      {t.common.upcoming}
    </span>
  );
};
