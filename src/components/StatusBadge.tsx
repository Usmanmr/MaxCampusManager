import React from 'react';
import { AttendanceStatus } from '../shared/types';
import { STRINGS } from '../shared/strings';

interface StatusCellProps {
  status: AttendanceStatus;
  showFullLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * High-contrast accessible Attendance Status indicator.
 * Always displays the explicit letter (P, A, L, E, M) alongside semantic color (Spec Section 9.4 & 10).
 */
export const AttendanceStatusCell: React.FC<StatusCellProps> = ({
  status,
  showFullLabel = false,
  size = 'md',
}) => {
  const styles: Record<AttendanceStatus, string> = {
    P: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800',
    A: 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-800',
    L: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800',
    E: 'bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-800',
    M: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  };

  const sizeClass =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-xs min-w-[26px]'
      : size === 'lg'
        ? 'px-3 py-1.5 text-sm min-w-[44px] min-h-[36px]'
        : 'px-2 py-1 text-xs min-w-[32px]';

  return (
    <span
      className={`inline-flex items-center justify-center font-mono-tabular font-semibold border rounded ${sizeClass} ${styles[status]} whitespace-nowrap shrink-0`}
      title={STRINGS.statusLabels[status]}
    >
      <span>{status}</span>
      {showFullLabel && (
        <span className="ml-1.5 font-sans font-medium">{STRINGS.statusLabels[status]}</span>
      )}
    </span>
  );
};

interface BandTextProps {
  band: 'ok' | 'at_risk' | 'shortage' | 'no_sessions';
  pct: number | null;
}

export const AttendanceBandText: React.FC<BandTextProps> = ({ band, pct }) => {
  if (band === 'no_sessions' || pct === null) {
    return <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">— No sessions</span>;
  }

  if (band === 'shortage') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 whitespace-nowrap">
        <span className="font-mono-tabular">{pct.toFixed(1)}%</span>
        <span aria-hidden="true">·</span>
        <span>Shortage</span>
      </span>
    );
  }

  if (band === 'at_risk') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <span className="font-mono-tabular">{pct.toFixed(1)}%</span>
        <span aria-hidden="true">·</span>
        <span>At risk</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
      <span className="font-mono-tabular">{pct.toFixed(1)}%</span>
      <span aria-hidden="true">·</span>
      <span>OK</span>
    </span>
  );
};
