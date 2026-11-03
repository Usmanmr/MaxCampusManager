import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  History,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  AuditLog,
  Campus,
  CampusSettings,
  ClassEntity,
  CorrectionRequest,
  RoleAssignment,
  Section,
  Session,
  Staff,
  Student,
  User,
} from '../shared/types';
import {
  calculateAttendance,
  can,
  formatDatePKT,
} from '../shared/attendanceEngine';
import { AttendanceBandText, AttendanceStatusCell } from './StatusBadge';

interface AdminAndGovernanceViewProps {
  currentUser: User;
  currentUserRoles: RoleAssignment[];
  activeCampus: Campus;
  settings: CampusSettings;
  correctionRequests: CorrectionRequest[];
  sessions: Session[];
  classes: ClassEntity[];
  sections: Section[];
  students: Student[];
  staff: Staff[];
  auditLogs: AuditLog[];
  fullStateForBackup: unknown;
  onReviewCorrection: (
    requestId: string,
    payload: { decision: 'approved' | 'rejected'; comment: string }
  ) => Promise<void>;
  onUpdateSettings: (campusId: string, payload: Partial<CampusSettings>) => Promise<void>;
}

type GovTab = 'corrections' | 'settings' | 'audit-log';

export const AdminAndGovernanceView: React.FC<AdminAndGovernanceViewProps> = ({
  currentUser,
  currentUserRoles,
  activeCampus,
  settings,
  correctionRequests,
  sessions,
  classes,
  sections,
  students,
  staff,
  auditLogs,
  fullStateForBackup,
  onReviewCorrection,
  onUpdateSettings,
}) => {
  const [subTab, setSubTab] = useState<GovTab>('corrections');
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Local editable settings state
  const [formSettings, setFormSettings] = useState<CampusSettings>(settings);

  React.useEffect(() => {
    setFormSettings(settings);
  }, [settings]);

  const canEditSettings = can(currentUser, currentUserRoles, 'edit_campus_settings', {
    campusId: activeCampus.id,
  });

  // Live Worked Calculation Preview (Spec Section 5.7 & Prompt 2)
  // Practical: 38 held (2-hour sessions), P 30, L 3, A 3, M 2
  const practicalPreview = calculateAttendance(
    {
      held: 38,
      present: 30,
      late: 3,
      absent: 3,
      excused: 0,
      medical: 2,
      minutesHeld: 38 * 120,
      minutesAttended: 33 * 120,
      minutesExcusedOrMedical: 2 * 120,
    },
    formSettings
  );

  // Lecture: 50 held (1-hour sessions), P 34, A 16
  const lecturePreview = calculateAttendance(
    {
      held: 50,
      present: 34,
      late: 0,
      absent: 16,
      excused: 0,
      medical: 0,
      minutesHeld: 50 * 60,
      minutesAttended: 34 * 60,
      minutesExcusedOrMedical: 0,
    },
    formSettings
  );

  // Combined Course (Practical + Lecture)
  const combinedPreview = calculateAttendance(
    {
      held: 88,
      present: 64,
      late: 3,
      absent: 19,
      excused: 0,
      medical: 2,
      minutesHeld: 38 * 120 + 50 * 60,
      minutesAttended: 33 * 120 + 34 * 60,
      minutesExcusedOrMedical: 2 * 120,
    },
    formSettings
  );

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings(activeCampus.id, formSettings);
    setSavedNotice('Campus settings saved, audited, and applied to all reports immediately.');
    setTimeout(() => setSavedNotice(null), 3500);
  };

  const handleDownloadFullBackup = () => {
    const blob = new Blob([JSON.stringify(fullStateForBackup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ABWA_Knowledge_Village_Full_Backup_${activeCampus.code}_2026-11-02.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Post-Lock Corrections, Campus Rules &amp; Audit Trail
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nothing is silently changed: locked sessions require an approved correction or audited admin override
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadFullBackup}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Full Backup (JSON)</span>
        </button>
      </div>

      {savedNotice && (
        <div
          role="status"
          className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setSubTab('corrections')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            subTab === 'corrections'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>1. Correction Requests Queue ({correctionRequests.filter((c) => c.state === 'pending').length} Pending)</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('settings')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            subTab === 'settings'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>2. Campus Settings &amp; Live Calculation Preview</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('audit-log')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            subTab === 'audit-log'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>3. Append-Only Audit Log ({auditLogs.length})</span>
        </button>
      </div>

      {/* 1. CORRECTION REQUESTS QUEUE */}
      {subTab === 'corrections' && (
        <div className="space-y-4">
          {correctionRequests.map((cr) => {
            const sess = sessions.find((s) => s.id === cr.sessionId);
            const cls = classes.find((c) => c.id === sess?.classId);
            const sec = sections.find((s) => s.id === sess?.sectionId);
            const reqStaff = staff.find((st) => st.id === cr.requestedByStaffId);
            const canApproveThis = can(currentUser, currentUserRoles, 'approve_correction', {
              campusId: activeCampus.id,
              departmentId: cls?.departmentId,
              hodCanApprove: settings.hodCanApprove,
            });

            return (
              <div
                key={cr.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono-tabular text-slate-500">
                      Request ID: {cr.id} · Raised by {reqStaff?.name || 'Faculty'} · Session Date:{' '}
                      {formatDatePKT(sess?.sessionDate)}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {cls?.title || 'Subject Class'} — Section {sec?.name}
                    </h3>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                      <strong>Teacher Reason:</strong> &ldquo;{cr.reason}&rdquo;
                    </p>
                  </div>

                  <span
                    className={`font-mono-tabular text-xs font-bold uppercase px-2.5 py-1 rounded ${
                      cr.state === 'pending'
                        ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                        : cr.state === 'approved'
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                          : 'bg-rose-50 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                    }`}
                  >
                    {cr.state}
                  </span>
                </div>

                {/* Requested Student Status Changes */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {cr.items.map((item) => {
                    const stu = students.find((s) => s.id === item.studentId);
                    return (
                      <div key={item.studentId} className="px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-mono-tabular font-bold mr-2">
                            Roll #{stu?.rollNo}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {stu?.name}
                          </span>
                          <span className="ml-2 font-mono-tabular text-slate-500">
                            ({stu?.regNo})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AttendanceStatusCell status={item.fromStatus} showFullLabel />
                          <span className="text-slate-400">→</span>
                          <AttendanceStatusCell status={item.toStatus} showFullLabel />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {cr.state === 'pending' && canApproveThis ? (
                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <input
                      type="text"
                      placeholder="Reviewer comment (required for rejection, optional for approval)..."
                      value={reviewComments[cr.id] || ''}
                      onChange={(e) =>
                        setReviewComments((prev) => ({ ...prev, [cr.id]: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          await onReviewCorrection(cr.id, {
                            decision: 'approved',
                            comment: reviewComments[cr.id] || 'Verified and approved.',
                          });
                          setSavedNotice('Correction request approved; register updated and audited.');
                          setTimeout(() => setSavedNotice(null), 3000);
                        }}
                        className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve &amp; Apply</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await onReviewCorrection(cr.id, {
                            decision: 'rejected',
                            comment: reviewComments[cr.id] || 'Insufficient documentation.',
                          });
                          setSavedNotice('Correction request rejected.');
                          setTimeout(() => setSavedNotice(null), 3000);
                        }}
                        className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  cr.reviewComment && (
                    <div className="text-xs text-slate-500">
                      Reviewer Decision Note: &ldquo;{cr.reviewComment}&rdquo;
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 2. CAMPUS SETTINGS & LIVE WORKED CALCULATION PREVIEW */}
      {subTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5 text-xs"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {activeCampus.name} ({activeCampus.code}) — Attendance &amp; Policy Configuration
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                Configuration over code: thresholds, late rules, excused rules, and calculation basis are per-campus settings
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="setting-threshold"
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Shortage Threshold (%)
                </label>
                <input
                  id="setting-threshold"
                  type="number"
                  min={50}
                  max={95}
                  disabled={!canEditSettings}
                  value={formSettings.thresholdPct}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, thresholdPct: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular font-bold"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Below this % flags student as Shortage (default 75% per PMDC/UHS).
                </p>
              </div>

              <div>
                <label
                  htmlFor="setting-warning"
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  At-Risk Warning Band (%)
                </label>
                <input
                  id="setting-warning"
                  type="number"
                  min={55}
                  max={98}
                  disabled={!canEditSettings}
                  value={formSettings.warningPct}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, warningPct: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular font-bold"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Students between Threshold and Warning % are flagged At Risk.
                </p>
              </div>

              <div>
                <label
                  htmlFor="setting-lock-hours"
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Session Lock Window (Hours)
                </label>
                <input
                  id="setting-lock-hours"
                  type="number"
                  min={1}
                  max={168}
                  disabled={!canEditSettings}
                  value={formSettings.lockHours}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, lockHours: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular font-bold"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Hours after session end before teacher edits lock (default 24h).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label
                  htmlFor="setting-late-rule"
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Late Arrival Counting Rule
                </label>
                <select
                  id="setting-late-rule"
                  disabled={!canEditSettings}
                  value={formSettings.lateRule}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      lateRule: e.target.value as 'present' | 'n_lates_one_absence',
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-semibold"
                >
                  <option value="present">Late counts as Present</option>
                  <option value="n_lates_one_absence">Every 3 Lates = 1 Absence</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="setting-excused-rule"
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Excused (E) &amp; Medical (M) Rule
                </label>
                <select
                  id="setting-excused-rule"
                  disabled={!canEditSettings}
                  value={formSettings.excusedRule}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      excusedRule: e.target.value as 'exclude' | 'present',
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-semibold"
                >
                  <option value="exclude">Exclude from Total Held</option>
                  <option value="present">Count as Present</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="setting-calc-basis"
                  className="block font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Percentage Calculation Basis
                </label>
                <select
                  id="setting-calc-basis"
                  disabled={!canEditSettings}
                  value={formSettings.calcBasis}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      calcBasis: e.target.value as 'sessions' | 'hours',
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-semibold"
                >
                  <option value="sessions">By Session Count</option>
                  <option value="hours">By Contact Hours (Weighted)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEditSettings}
                  checked={formSettings.hodCanApprove}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, hodCanApprove: e.target.checked })
                  }
                  className="rounded border-slate-300"
                />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Allow Head of Department (HOD) to approve post-lock correction requests for their department
                </span>
              </label>

              {canEditSettings && (
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Save &amp; Audit Settings
                </button>
              )}
            </div>
          </form>

          {/* Right 5 Cols: Live Worked Calculation Preview (Spec Section 5.7 & Prompt 2) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Live Worked Calculation Preview (Section 5.7)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Change any rule on the left to see how Student Roll 23&apos;s percentages respond in real time:
              </p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    1. Anatomy Practical (2-hour sessions)
                  </div>
                  <div className="font-mono-tabular text-slate-500">
                    38 held: 30 P, 3 L, 3 A, 2 M
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono-tabular font-semibold">
                    {practicalPreview.attended} / {practicalPreview.denominator}
                    {formSettings.calcBasis === 'hours' ? ' h' : ''}
                  </div>
                  <AttendanceBandText band={practicalPreview.band} pct={practicalPreview.pct} />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    2. Anatomy Lecture (1-hour sessions)
                  </div>
                  <div className="font-mono-tabular text-slate-500">
                    50 held: 34 P, 16 A
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono-tabular font-semibold">
                    {lecturePreview.attended} / {lecturePreview.denominator}
                    {formSettings.calcBasis === 'hours' ? ' h' : ''}
                  </div>
                  <AttendanceBandText band={lecturePreview.band} pct={lecturePreview.pct} />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    3. Combined Anatomy Course Total
                  </div>
                  <div className="font-mono-tabular text-slate-500">
                    Basis: {formSettings.calcBasis === 'hours' ? 'Contact Hours (100h / 122h)' : 'Session Count'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono-tabular font-semibold">
                    {combinedPreview.attended} / {combinedPreview.denominator}
                    {formSettings.calcBasis === 'hours' ? ' h' : ''}
                  </div>
                  <AttendanceBandText band={combinedPreview.band} pct={combinedPreview.pct} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. APPEND-ONLY AUDIT LOG */}
      {subTab === 'audit-log' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Immutable Append-Only Audit Log (`audit_logs`)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Every session submission, locked edit, correction review, HOD appointment, and settings update is permanently recorded
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-3 px-4">UTC Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action &amp; Entity</th>
                  <th className="py-3 px-4">Change Details &amp; Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">
                      {log.at.replace('T', ' ').slice(0, 19)} UTC
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {log.actorName}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {log.action}
                      </span>
                      <div className="text-slate-500">
                        {log.entityType} ({log.entityId})
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {log.reason && (
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          Reason: &ldquo;{log.reason}&rdquo;
                        </div>
                      )}
                      {log.after && (
                        <div className="font-mono-tabular text-[11px] text-slate-500 truncate max-w-md">
                          {JSON.stringify(log.after)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
