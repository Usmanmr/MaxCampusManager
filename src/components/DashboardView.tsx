import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  Plus,
} from 'lucide-react';
import {
  AttendanceRecord,
  Batch,
  Campus,
  CampusSettings,
  ClassEntity,
  CorrectionRequest,
  Department,
  Enrollment,
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
import { NavTabId } from './HeaderAndSidebar';

interface VillageSummaryItem {
  campus: Campus;
  settings?: CampusSettings;
  activeStudents: number;
  activeStaff: number;
  sessionsHeld: number;
  attendancePct: number | null;
  unmarkedSectionsToday: number;
}

interface DashboardViewProps {
  currentUser: User;
  currentUserRoles: RoleAssignment[];
  activeCampus: Campus;
  settings: CampusSettings;
  departments: Department[];
  batches: Batch[];
  classes: ClassEntity[];
  sections: Section[];
  students: Student[];
  staff: Staff[];
  enrollments: Enrollment[];
  sessions: Session[];
  attendanceRecords: AttendanceRecord[];
  correctionRequests: CorrectionRequest[];
  villageSummaries: VillageSummaryItem[];
  onSelectCampus: (campusId: string) => void;
  onSelectTab: (tab: NavTabId) => void;
  onStartAttendanceForSection: (sectionId: string) => void;
  onCreateCampus: (payload: { name: string; code: string; type: 'college' | 'university'; termType: 'annual' | 'semester' }) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  currentUserRoles,
  activeCampus,
  settings,
  departments,
  batches,
  classes,
  sections,
  students,
  staff,
  enrollments,
  sessions,
  attendanceRecords,
  correctionRequests,
  villageSummaries,
  onSelectCampus,
  onSelectTab,
  onStartAttendanceForSection,
  onCreateCampus,
}) => {
  const [copiedSecId, setCopiedSecId] = useState<string | null>(null);
  const [showNewCampusModal, setShowNewCampusModal] = useState(false);
  const [newCampusName, setNewCampusName] = useState('');
  const [newCampusCode, setNewCampusCode] = useState('');
  const [newCampusType, setNewCampusType] = useState<'college' | 'university'>('college');
  const [newCampusTermType, setNewCampusTermType] = useState<'annual' | 'semester'>('annual');

  const isSuperAdmin = can(currentUser, currentUserRoles, 'view_village_overview');
  const todayStr = '2026-11-02';

  // Active students & sessions stats for current campus
  const activeStudents = students.filter((s) => s.registrationState === 'active');
  const countedSessions = sessions.filter((s) => s.state === 'submitted' || s.state === 'locked');
  const todaySessions = sessions.filter((s) => s.sessionDate === todayStr && s.state !== 'cancelled');

  // Campus-wide overall attendance %
  const countedSessionIds = new Set(countedSessions.map((s) => s.id));
  const validRecords = attendanceRecords.filter((r) => countedSessionIds.has(r.sessionId));
  const presentOrLateCount = validRecords.filter((r) => r.status === 'P' || r.status === 'L').length;
  const campusPresentPct =
    validRecords.length > 0
      ? Math.round((presentOrLateCount / validRecords.length) * 1000) / 10
      : null;

  // Calculate Shortage & At-Risk counts across active students
  let shortageStudentsCount = 0;
  let atRiskStudentsCount = 0;

  for (const stu of activeStudents) {
    const stuRecords = validRecords.filter((r) => r.studentId === stu.id);
    if (stuRecords.length === 0) continue;
    const counts = {
      held: stuRecords.length,
      present: stuRecords.filter((r) => r.status === 'P').length,
      late: stuRecords.filter((r) => r.status === 'L').length,
      absent: stuRecords.filter((r) => r.status === 'A').length,
      excused: stuRecords.filter((r) => r.status === 'E').length,
      medical: stuRecords.filter((r) => r.status === 'M').length,
      minutesHeld: stuRecords.length * 60,
      minutesAttended: stuRecords.filter((r) => r.status === 'P' || r.status === 'L').length * 60,
    };
    const calc = calculateAttendance(counts, settings);
    if (calc.band === 'shortage') shortageStudentsCount++;
    else if (calc.band === 'at_risk') atRiskStudentsCount++;
  }

  // Unmarked sections today
  const markedSectionIdsToday = new Set(todaySessions.map((s) => s.sectionId));
  const unmarkedSections = sections.filter(
    (sec) => sec.status === 'active' && !markedSectionIdsToday.has(sec.id)
  );

  const pendingCorrections = correctionRequests.filter((cr) => cr.state === 'pending');

  // Setup Checklist summary gaps
  const vacantHeadDepts = departments.filter((d) => d.status === 'active' && !d.hodStaffId);
  const emptySections = sections.filter(
    (sec) =>
      sec.status === 'active' &&
      !enrollments.some(
        (e) => e.sectionId === sec.id && (!e.effectiveTo || e.effectiveTo >= todayStr)
      )
  );

  const handleCopyReminder = (sec: Section, cls?: ClassEntity, leadTeacher?: Staff) => {
    const msg = `Reminder (${activeCampus.code}): Attendance for ${cls?.title || 'Class'} — Section ${sec.name} on ${formatDatePKT(todayStr)} has not been submitted yet. Please mark via ABWA CMS.`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
    setCopiedSecId(sec.id);
    setTimeout(() => setCopiedSecId(null), 2500);
  };

  const handleCreateCampusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampusName.trim() || !newCampusCode.trim()) return;
    await onCreateCampus({
      name: newCampusName.trim(),
      code: newCampusCode.trim().toUpperCase(),
      type: newCampusType,
      termType: newCampusTermType,
    });
    setNewCampusName('');
    setNewCampusCode('');
    setShowNewCampusModal(false);
  };

  return (
    <div className="space-y-8">
      {/* Super Admin Village Overview Section */}
      {isSuperAdmin && villageSummaries.length > 0 && (
        <section aria-labelledby="village-overview-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="village-overview-heading"
                className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
              >
                ABWA Knowledge Village — Multi-Campus Overview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Super Admin cross-institution summary · Strict campus_id isolation enforced across all 46 tables
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewCampusModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Campus</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {villageSummaries.map((item) => {
              const isSelected = item.campus.id === activeCampus.id;
              return (
                <div
                  key={item.campus.id}
                  className={`p-5 rounded-lg border transition-colors bg-white dark:bg-slate-900 ${
                    isSelected
                      ? 'border-slate-900 dark:border-slate-200'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono-tabular font-semibold text-slate-500 dark:text-slate-400">
                        {item.campus.code} · {item.campus.type.toUpperCase()} · {item.campus.termType.toUpperCase()}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {item.campus.name}
                      </h3>
                    </div>
                    {isSelected ? (
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Active View
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectCampus(item.campus.id)}
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300 underline hover:text-slate-900 dark:hover:text-white"
                      >
                        Switch to {item.campus.code}
                      </button>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Attendance</div>
                      <div className="text-lg font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
                        {item.attendancePct !== null ? `${item.attendancePct}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Students</div>
                      <div className="text-lg font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
                        {item.activeStudents}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Unmarked</div>
                      <div className="text-lg font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
                        {item.unmarkedSectionsToday}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Campus Hero & Operational Status */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
                {activeCampus.code}
              </span>
              <span aria-hidden="true">·</span>
              <span>Date: {formatDatePKT(todayStr)}</span>
              <span aria-hidden="true">·</span>
              <span>Threshold: {settings.thresholdPct}% (Warning {settings.warningPct}%)</span>
              <span aria-hidden="true">·</span>
              <span>Lock Window: {settings.lockHours}h</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {activeCampus.name} — Daily Operations Dashboard
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Signed in as <strong className="font-semibold text-slate-900 dark:text-slate-200">{currentUser.name}</strong> · UHS Modular Integrated Curriculum 2K23 active for MBBS Batch 2026
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('take-attendance')}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 rounded-md transition-colors"
            >
              Open My Classes & Mark Attendance
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('reports')}
              className="px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md transition-colors"
            >
              View Section Registers & Shortage List
            </button>
          </div>
        </div>

        {/* 5-Column High-Contrast KPI Strip */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Sessions Logged (Term)
            </div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
              {countedSessions.length}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {todaySessions.length} held today ({formatDatePKT(todayStr)})
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Campus Attendance Rate
            </div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
              {campusPresentPct !== null ? `${campusPresentPct.toFixed(1)}%` : '—'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Basis: {settings.calcBasis === 'hours' ? 'Contact hours' : 'Session count'}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Students in Shortage (&lt;{settings.thresholdPct}%)
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono-tabular text-rose-700 dark:text-rose-400">
                {shortageStudentsCount}
              </span>
              <span className="text-xs font-mono-tabular text-amber-700 dark:text-amber-400">
                +{atRiskStudentsCount} at risk
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectTab('reports')}
              className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300 underline hover:text-slate-900"
            >
              Inspect Shortage List
            </button>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Unmarked Sections Today
            </div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
              {unmarkedSections.length}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Out of {sections.filter((s) => s.status === 'active').length} active sections
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Pending Corrections
            </div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular text-amber-700 dark:text-amber-400">
              {pendingCorrections.length}
            </div>
            <button
              type="button"
              onClick={() => onSelectTab('governance')}
              className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300 underline hover:text-slate-900"
            >
              Review Approval Queue
            </button>
          </div>
        </div>
      </section>

      {/* Main Two-Column Grid: Unmarked Sections Today + Batch & Setup Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Today's Sections & Follow-up Table */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Today&apos;s Sections &amp; Register Status ({formatDatePKT(todayStr)})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Follow up with faculty on unmarked sections or start attendance directly
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
                  <th className="py-3 px-4">Class &amp; Section</th>
                  <th className="py-3 px-4">Assigned Teacher</th>
                  <th className="py-3 px-4 text-right">Roster</th>
                  <th className="py-3 px-4">Today&apos;s Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {sections
                  .filter((s) => s.status === 'active')
                  .map((sec) => {
                    const cls = classes.find((c) => c.id === sec.classId);
                    const leadStaff = staff.find(
                      (st) => st.id === (sec.teacherStaffIds[0] || cls?.leadTeacherStaffId)
                    );
                    const rosterCount = enrollments.filter(
                      (e) =>
                        e.sectionId === sec.id &&
                        (!e.effectiveTo || e.effectiveTo >= todayStr)
                    ).length;
                    const todaySess = todaySessions.find((s) => s.sectionId === sec.id);

                    return (
                      <tr
                        key={sec.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {cls?.title || 'Class'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Section: <strong className="font-medium text-slate-700 dark:text-slate-300">{sec.name}</strong> · {sec.venue}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                          {leadStaff ? leadStaff.name : 'Unassigned'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {rosterCount}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {todaySess ? (
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
                              {todaySess.state === 'draft' ? 'In Draft (Unsaved)' : 'Submitted'}
                            </span>
                          ) : (
                            <span className="font-medium text-amber-700 dark:text-amber-400">
                              Not marked yet
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {!todaySess && (
                              <button
                                type="button"
                                onClick={() => handleCopyReminder(sec, cls, leadStaff)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Copy WhatsApp/SMS reminder text for teacher"
                              >
                                {copiedSecId === sec.id ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Copied
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <Copy className="w-3 h-3" /> Remind
                                  </span>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onStartAttendanceForSection(sec.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 rounded transition-colors"
                            >
                              {todaySess ? 'Open Register' : 'Mark Now'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 5 Cols: Batch Attendance Breakdown & Setup Checklist Health */}
        <div className="lg:col-span-5 space-y-6">
          {/* Batch Attendance & 30-Day Trend Summary */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Attendance by Intake Batch &amp; Cohort
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current academic year performance vs {settings.thresholdPct}% eligibility threshold
              </p>
            </div>

            <div className="space-y-4">
              {batches.map((b) => {
                const batchStudentIds = new Set(
                  activeStudents.filter((s) => s.batchId === b.id).map((s) => s.id)
                );
                const bRecords = validRecords.filter((r) => batchStudentIds.has(r.studentId));
                const bPresent = bRecords.filter((r) => r.status === 'P' || r.status === 'L').length;
                const bPct =
                  bRecords.length > 0 ? Math.round((bPresent / bRecords.length) * 1000) / 10 : 0;

                return (
                  <div key={b.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {b.yearClassLabel}
                      </span>
                      <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
                        {bRecords.length > 0 ? `${bPct.toFixed(1)}%` : 'No sessions'} · {batchStudentIds.size} students
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          bPct < settings.thresholdPct
                            ? 'bg-rose-600'
                            : bPct < settings.warningPct
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(8, bPct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Setup Checklist & Go-Live Readiness Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Campus Setup Checklist &amp; Go-Live Status
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Automated checks for vacant HODs, unassigned groups, and empty rosters
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab('academics')}
                className="text-xs font-semibold text-slate-900 dark:text-slate-200 inline-flex items-center gap-1 hover:underline"
              >
                <span>Configure</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300">
                  Departments with Vacant Head (HOD)
                </span>
                {vacantHeadDepts.length > 0 ? (
                  <span className="font-mono-tabular font-semibold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {vacantHeadDepts.length} ({vacantHeadDepts.map((d) => d.name).join(', ')})
                  </span>
                ) : (
                  <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                    All assigned
                  </span>
                )}
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300">
                  Active Sections with Zero Enrolled Students
                </span>
                <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                  {emptySections.length === 0 ? '0 gaps (Ready)' : `${emptySections.length} empty`}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300">
                  UHS 2K23 Block &amp; Module Calendar Linked
                </span>
                <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                  Block-1 / HEM-I Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Campus Modal (Super Admin) */}
      {showNewCampusModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-campus-title"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 id="add-campus-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                Create New Campus in ABWA Knowledge Village
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCampusModal(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleCreateCampusSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Institution Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., ABWA Paramedical & Allied Health College"
                  value={newCampusName}
                  onChange={(e) => setNewCampusName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Short Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., APC"
                    value={newCampusCode}
                    onChange={(e) => setNewCampusCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular uppercase bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Term Structure
                  </label>
                  <select
                    value={newCampusTermType}
                    onChange={(e) => setNewCampusTermType(e.target.value as 'annual' | 'semester')}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    <option value="annual">Annual (Years)</option>
                    <option value="semester">Semester (Fall/Spring)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCampusModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Create Campus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
