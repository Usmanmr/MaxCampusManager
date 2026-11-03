import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  FileEdit,
  Grid,
  List,
  Lock,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  AttendanceRecord,
  AttendanceStatus,
  BatchCurriculumDate,
  CampusSettings,
  ClassEntity,
  ClinicalSubtype,
  CurriculumBlock,
  CurriculumModule,
  Enrollment,
  HospitalLocation,
  RoleAssignment,
  Section,
  Session,
  Staff,
  Student,
  User,
} from '../shared/types';
import {
  can,
  formatDatePKT,
  formatTime12h,
  getCurriculumTag,
  getSessionLockStatus,
} from '../shared/attendanceEngine';
import { AttendanceStatusCell } from './StatusBadge';

interface TakeAttendanceViewProps {
  currentUser: User;
  currentUserRoles: RoleAssignment[];
  currentUserStaff: Staff | null;
  settings: CampusSettings;
  classes: ClassEntity[];
  sections: Section[];
  students: Student[];
  staff: Staff[];
  enrollments: Enrollment[];
  sessions: Session[];
  attendanceRecords: AttendanceRecord[];
  curriculumBlocks: CurriculumBlock[];
  curriculumModules: CurriculumModule[];
  batchCurriculumDates: BatchCurriculumDate[];
  hospitalLocations: HospitalLocation[];
  initialSectionId?: string | null;
  onCreateSession: (payload: Record<string, unknown>) => Promise<Session>;
  onSaveRecords: (
    sessionId: string,
    payload: {
      version: number;
      topic: string;
      records: Array<{ studentId: string; status: AttendanceStatus; remark?: string }>;
    }
  ) => Promise<void>;
  onSubmitSession: (
    sessionId: string,
    payload: {
      version: number;
      topic: string;
      idempotencyKey: string;
      records: Array<{ studentId: string; status: AttendanceStatus; remark?: string }>;
    }
  ) => Promise<void>;
  onAdminEditLocked: (
    sessionId: string,
    payload: {
      reason?: string;
      lockNow?: boolean;
      records?: Array<{ studentId: string; status: AttendanceStatus; remark?: string }>;
    }
  ) => Promise<void>;
  onCancelSession: (sessionId: string, reason: string) => Promise<void>;
  onRaiseCorrection: (payload: {
    sessionId: string;
    reason: string;
    items: Array<{ studentId: string; fromStatus: AttendanceStatus; toStatus: AttendanceStatus }>;
  }) => Promise<void>;
}

const CYCLE_ORDER: AttendanceStatus[] = ['P', 'A', 'L', 'E'];

const QUICK_TOPICS: Record<string, string[]> = {
  lecture: [
    'Brachial Plexus Formation, Cord Branches & Clinical Lesions',
    'Lymphatic Drainage of Upper Limb & Axillary Nodes',
    'Hematopoiesis, Bone Marrow Microenvironment & Stem Cells',
    'Hemoglobin Structure, Synthesis & Porphyrias',
    'Anemias: Morphological & Etiological Classification',
  ],
  practical: [
    'Surface Marking & Dissection of Axilla and Pectoral Region',
    'Microscopic Identification of Thymus, Spleen & Lymph Node',
    'Reticulocyte Count, ESR & Packed Cell Volume (Hematocrit)',
    'Osteology of Clavicle, Scapula & Humerus',
  ],
  clinical: [
    'Bedside History Taking & Examination of Acute Abdomen',
    'Pre-operative & Post-operative Ward Round in Surgery Unit II',
    'Clinical Demonstration: Hernia Examination & Differential Diagnosis',
  ],
};

export const TakeAttendanceView: React.FC<TakeAttendanceViewProps> = ({
  currentUser,
  currentUserRoles,
  currentUserStaff,
  settings,
  classes,
  sections,
  students,
  staff,
  enrollments,
  sessions,
  attendanceRecords,
  curriculumBlocks,
  curriculumModules,
  batchCurriculumDates,
  hospitalLocations,
  initialSectionId,
  onCreateSession,
  onSaveRecords,
  onSubmitSession,
  onAdminEditLocked,
  onCancelSession,
  onRaiseCorrection,
}) => {
  const isAdmin = can(currentUser, currentUserRoles, 'edit_locked_session', {
    campusId: settings.campusId,
  });

  // Filter sections visible to the signed-in teacher (or all active sections for Admin/SuperAdmin)
  const accessibleSections = useMemo(() => {
    const activeSecs = sections.filter((s) => s.status === 'active');
    if (isAdmin) return activeSecs;
    if (!currentUserStaff) return activeSecs;
    return activeSecs.filter((sec) => {
      const cls = classes.find((c) => c.id === sec.classId);
      return (
        sec.teacherStaffIds.includes(currentUserStaff.id) ||
        cls?.teacherStaffIds.includes(currentUserStaff.id) ||
        cls?.leadTeacherStaffId === currentUserStaff.id
      );
    });
  }, [sections, classes, isAdmin, currentUserStaff]);

  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    initialSectionId || accessibleSections[0]?.id || ''
  );

  useEffect(() => {
    if (initialSectionId && sections.some((s) => s.id === initialSectionId)) {
      setSelectedSectionId(initialSectionId);
    } else if (!accessibleSections.some((s) => s.id === selectedSectionId)) {
      setSelectedSectionId(accessibleSections[0]?.id || '');
    }
  }, [initialSectionId, accessibleSections, sections, selectedSectionId]);

  const sectionSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.sectionId === selectedSectionId)
        .sort((a, b) => `${b.sessionDate}${b.startTime}`.localeCompare(`${a.sessionDate}${a.startTime}`)),
    [sessions, selectedSectionId]
  );

  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sectionSessions[0]?.id || ''
  );

  useEffect(() => {
    if (!sectionSessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(sectionSessions[0]?.id || '');
    }
  }, [sectionSessions, selectedSessionId]);

  const activeSection = sections.find((s) => s.id === selectedSectionId);
  const activeClass = classes.find((c) => c.id === activeSection?.classId);
  const activeSession = sessions.find((s) => s.id === selectedSessionId);

  // Local working state for roster marks
  const [localMarks, setLocalMarks] = useState<
    Record<string, { status: AttendanceStatus; remark?: string }>
  >({});
  const [topicInput, setTopicInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [remarkModalStudentId, setRemarkModalStudentId] = useState<string | null>(null);
  const [remarkStatus, setRemarkStatus] = useState<AttendanceStatus>('M');
  const [remarkText, setRemarkText] = useState<string>('');
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionEdits, setCorrectionEdits] = useState<Record<string, AttendanceStatus>>({});
  const [adminEditReason, setAdminEditReason] = useState('');
  const [showAdminEditModal, setShowAdminEditModal] = useState(false);

  // New Session Form State
  const [newDate, setNewDate] = useState('2026-11-02');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('10:00');
  const [newTopic, setNewTopic] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const [newDefaultStatus, setNewDefaultStatus] = useState<'P' | 'A'>('P');
  const [newIsSubstitute, setNewIsSubstitute] = useState(false);
  const [newClinicalSubtype, setNewClinicalSubtype] = useState<ClinicalSubtype>('ward_round');
  const [newLocationId, setNewLocationId] = useState<string>('hloc-1');
  const [holidayOverrideReason, setHolidayOverrideReason] = useState('');

  // Load session records into localMarks (checking localStorage draft first if session is draft)
  useEffect(() => {
    if (!activeSession) {
      setLocalMarks({});
      setTopicInput('');
      return;
    }
    setTopicInput(activeSession.topic);

    const draftKey = `abwa_draft_${activeSession.id}`;
    if (activeSession.state === 'draft') {
      try {
        const cached = localStorage.getItem(draftKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') {
            setLocalMarks(parsed);
            return;
          }
        }
      } catch {
        // fallback to server records
      }
    }

    const sessionRecs = attendanceRecords.filter((ar) => ar.sessionId === activeSession.id);
    const map: Record<string, { status: AttendanceStatus; remark?: string }> = {};
    for (const r of sessionRecs) {
      map[r.studentId] = { status: r.status, remark: r.remark };
    }
    setLocalMarks(map);
  }, [activeSession, attendanceRecords]);

  // Roster students sorted by Roll Number
  const rosterStudents = useMemo(() => {
    if (!activeSession) return [];
    const sessionStudentIds = new Set(
      attendanceRecords
        .filter((ar) => ar.sessionId === activeSession.id)
        .map((ar) => ar.studentId)
    );
    return students
      .filter((s) => sessionStudentIds.has(s.id))
      .sort((a, b) => (a.rollNo || 999) - (b.rollNo || 999));
  }, [activeSession, attendanceRecords, students]);

  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rosterStudents;
    return rosterStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        String(s.rollNo || '').includes(q) ||
        (s.regNo && s.regNo.toLowerCase().includes(q))
    );
  }, [rosterStudents, searchQuery]);

  const lockInfo = activeSession
    ? getSessionLockStatus(activeSession, settings.lockHours)
    : { isLocked: false, remainingMinutes: 0, remainingLabel: '' };

  const canTeacherEditNow =
    !!activeSession &&
    activeSession.state !== 'cancelled' &&
    !lockInfo.isLocked;

  // Autosave to localStorage whenever teacher updates marks
  const updateStudentMark = (
    studentId: string,
    status: AttendanceStatus,
    remark?: string
  ) => {
    if (!activeSession) return;
    if (!canTeacherEditNow && !showAdminEditModal) return;

    setLocalMarks((prev) => {
      const next = {
        ...prev,
        [studentId]: {
          status,
          remark: remark !== undefined ? remark : prev[studentId]?.remark,
        },
      };
      if (activeSession.state === 'draft') {
        try {
          localStorage.setItem(`abwa_draft_${activeSession.id}`, JSON.stringify(next));
        } catch {
          // ignore quota error
        }
      }
      return next;
    });
    setSavedBanner('Autosaved to device');
    setTimeout(() => setSavedBanner(null), 1800);
  };

  const handleCycleStatus = (studentId: string) => {
    const current = localMarks[studentId]?.status || 'P';
    const idx = CYCLE_ORDER.indexOf(current);
    const nextStatus = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    if (nextStatus === 'E') {
      // Prompt for excused remark or set default
      updateStudentMark(studentId, 'E', localMarks[studentId]?.remark || 'Approved leave application');
    } else {
      updateStudentMark(studentId, nextStatus);
    }
  };

  const handleBulkSet = (status: 'P' | 'A') => {
    if (!activeSession || !canTeacherEditNow) return;
    const next: Record<string, { status: AttendanceStatus; remark?: string }> = {};
    for (const s of rosterStudents) {
      next[s.id] = { status };
    }
    setLocalMarks(next);
    if (activeSession.state === 'draft') {
      try {
        localStorage.setItem(`abwa_draft_${activeSession.id}`, JSON.stringify(next));
      } catch {}
    }
    setSavedBanner(`Marked all ${rosterStudents.length} students as ${status === 'P' ? 'Present' : 'Absent'}`);
    setTimeout(() => setSavedBanner(null), 2000);
  };

  // Desktop Keyboard Shortcuts (Spec Section 5.9 item 9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        !activeSession ||
        !canTeacherEditNow ||
        showNewSessionModal ||
        showSubmitConfirm ||
        remarkModalStudentId ||
        showCorrectionModal
      ) {
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(filteredRoster.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
      } else if (['p', 'P', 'a', 'A', 'l', 'L', 'e', 'E'].includes(e.key)) {
        const stu = filteredRoster[focusedIndex];
        if (!stu) return;
        e.preventDefault();
        const code = e.key.toUpperCase() as AttendanceStatus;
        updateStudentMark(
          stu.id,
          code,
          code === 'E' ? localMarks[stu.id]?.remark || 'Approved leave' : undefined
        );
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        setShowSubmitConfirm(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Live Counter totals
  const liveCounts = useMemo(() => {
    let P = 0;
    let A = 0;
    let L = 0;
    let E = 0;
    let M = 0;
    const absentRolls: number[] = [];

    for (const stu of rosterStudents) {
      const st = localMarks[stu.id]?.status || 'P';
      if (st === 'P') P++;
      else if (st === 'A') {
        A++;
        if (stu.rollNo !== null) absentRolls.push(stu.rollNo);
      } else if (st === 'L') L++;
      else if (st === 'E') E++;
      else if (st === 'M') M++;
    }
    return { P, A, L, E, M, total: rosterStudents.length, absentRolls };
  }, [rosterStudents, localMarks]);

  const buildRecordsArray = () =>
    rosterStudents.map((stu) => ({
      studentId: stu.id,
      status: localMarks[stu.id]?.status || 'P',
      remark: localMarks[stu.id]?.remark,
    }));

  const handleSaveDraftClick = async () => {
    if (!activeSession) return;
    setErrorMessage(null);
    try {
      await onSaveRecords(activeSession.id, {
        version: activeSession.version,
        topic: topicInput,
        records: buildRecordsArray(),
      });
      setSavedBanner('Draft synced to server');
      setTimeout(() => setSavedBanner(null), 2500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save draft.');
    }
  };

  const handleConfirmSubmit = async () => {
    if (!activeSession) return;
    setErrorMessage(null);
    try {
      await onSubmitSession(activeSession.id, {
        version: activeSession.version,
        topic: topicInput,
        idempotencyKey: `idem-${activeSession.id}-${activeSession.version}`,
        records: buildRecordsArray(),
      });
      try {
        localStorage.removeItem(`abwa_draft_${activeSession.id}`);
      } catch {}
      setShowSubmitConfirm(false);
      setSavedBanner('Attendance submitted and verified');
      setTimeout(() => setSavedBanner(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit attendance.');
      setShowSubmitConfirm(false);
    }
  };

  const handleOpenNewSession = () => {
    if (!activeSection || !activeClass) return;
    setErrorMessage(null);
    setNewDate('2026-11-02');
    setNewStartTime('14:00');
    setNewEndTime(activeClass.defaultDurationMin === 120 ? '16:00' : '15:00');
    const suggestions = QUICK_TOPICS[activeClass.classType] || QUICK_TOPICS.lecture;
    setNewTopic(suggestions[0]);
    setNewVenue(activeSection.venue || activeClass.venue);
    setShowNewSessionModal(true);
  };

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSection || !activeClass) return;
    setErrorMessage(null);
    try {
      const created = await onCreateSession({
        classId: activeClass.id,
        sectionId: activeSection.id,
        sessionDate: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        sessionType: activeClass.classType,
        clinicalSubtype: activeClass.classType === 'clinical' ? newClinicalSubtype : undefined,
        locationId: activeClass.classType === 'clinical' ? newLocationId : null,
        topic: newTopic,
        conductedByStaffId: currentUserStaff?.id || activeClass.leadTeacherStaffId,
        isSubstitute: newIsSubstitute,
        venue: newVenue,
        defaultStatus: newDefaultStatus,
        holidayOverrideReason: holidayOverrideReason || undefined,
      });
      setShowNewSessionModal(false);
      setSelectedSessionId(created.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not create session.');
    }
  };

  const handleOpenCorrectionModal = () => {
    const initial: Record<string, AttendanceStatus> = {};
    for (const s of rosterStudents) {
      initial[s.id] = localMarks[s.id]?.status || 'P';
    }
    setCorrectionEdits(initial);
    setCorrectionReason('');
    setShowCorrectionModal(true);
  };

  const handleRaiseCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    const changedItems = rosterStudents
      .filter((s) => (localMarks[s.id]?.status || 'P') !== correctionEdits[s.id])
      .map((s) => ({
        studentId: s.id,
        fromStatus: localMarks[s.id]?.status || 'P',
        toStatus: correctionEdits[s.id],
      }));

    if (changedItems.length === 0) {
      setErrorMessage('Change at least one student status to raise a correction request.');
      return;
    }

    try {
      await onRaiseCorrection({
        sessionId: activeSession.id,
        reason: correctionReason,
        items: changedItems,
      });
      setShowCorrectionModal(false);
      setSavedBanner('Correction request submitted to approval queue');
      setTimeout(() => setSavedBanner(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit correction request.');
    }
  };

  const handleAdminDirectEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    try {
      await onAdminEditLocked(activeSession.id, {
        reason: adminEditReason,
        records: buildRecordsArray(),
      });
      setShowAdminEditModal(false);
      setAdminEditReason('');
      setSavedBanner('Locked session updated by Admin and recorded in Audit Log');
      setTimeout(() => setSavedBanner(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Admin edit failed.');
    }
  };

  // UHS Curriculum Tag for active session
  const sessionCurriculumTag = useMemo(() => {
    if (!activeClass || !activeSession) return { block: null, module: null };
    return getCurriculumTag(
      activeClass.batchId,
      activeSession.sessionDate,
      curriculumBlocks,
      curriculumModules,
      batchCurriculumDates
    );
  }, [activeClass, activeSession, curriculumBlocks, curriculumModules, batchCurriculumDates]);

  return (
    <div className="space-y-6 pb-20">
      {/* Section Picker Strip (My Classes & Clinical Rotations) */}
      <section aria-labelledby="my-sections-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 id="my-sections-heading" className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              My Classes &amp; Attendance Register
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a section below to mark a live session, log a new class meeting, or review locked registers
            </p>
          </div>
          {activeSection && (
            <button
              type="button"
              onClick={handleOpenNewSession}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log New Session for {activeSection.name}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {accessibleSections.map((sec) => {
            const cls = classes.find((c) => c.id === sec.classId);
            const isSelected = sec.id === selectedSectionId;
            const secRosterCount = enrollments.filter(
              (e) =>
                e.sectionId === sec.id &&
                (!e.effectiveTo || e.effectiveTo >= '2026-11-02')
            ).length;
            const latestSess = sessions.find((s) => s.sectionId === sec.id);

            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSelectedSectionId(sec.id)}
                className={`text-left p-4 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                    : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between text-xs opacity-80">
                  <span className="font-mono-tabular uppercase font-semibold">
                    {cls?.classType || 'Class'}
                  </span>
                  <span className="font-mono-tabular">{secRosterCount} students</span>
                </div>
                <div className="mt-1 font-bold text-sm truncate">
                  {cls?.title || 'Subject Class'}
                </div>
                <div className="text-xs font-medium mt-0.5 truncate opacity-90">
                  Section: {sec.name} · {sec.venue}
                </div>
                <div className="mt-2 pt-2 border-t border-current/10 text-[11px] opacity-75 truncate">
                  {latestSess
                    ? `Last: ${formatDatePKT(latestSess.sessionDate)} (${latestSess.state})`
                    : 'No sessions logged yet'}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs font-medium text-rose-800 dark:text-rose-200 flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="underline ml-4 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {savedBanner && (
        <div
          role="status"
          className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* Session Selector & Header Card (Spec Section 5.9 item 1) */}
      {activeSession && activeClass && activeSection ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          {/* Session Picker Bar */}
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="session-select-dropdown"
                className="text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Session Register:
              </label>
              <select
                id="session-select-dropdown"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {sectionSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatDatePKT(s.sessionDate)} · {formatTime12h(s.startTime)}–{formatTime12h(s.endTime)} · [{s.state.toUpperCase()}] {s.topic}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 text-xs">
              {lockInfo.isLocked ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Locked (Read-Only for Teacher)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{lockInfo.remainingLabel}</span>
                </span>
              )}

              {activeSession.state === 'submitted' && !lockInfo.isLocked && isAdmin && (
                <button
                  type="button"
                  onClick={() => onAdminEditLocked(activeSession.id, { lockNow: true })}
                  className="px-2.5 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Lock Session Now
                </button>
              )}

              {lockInfo.isLocked && (
                <button
                  type="button"
                  onClick={handleOpenCorrectionModal}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded hover:opacity-90"
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  <span>Request Correction</span>
                </button>
              )}

              {lockInfo.isLocked && isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminEditModal(true)}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 rounded"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Admin Direct Edit</span>
                </button>
              )}
            </div>
          </div>

          {/* Session Metadata & Editable Topic Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {activeClass.title}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Section: {activeSection.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {formatDatePKT(activeSession.sessionDate)} ({formatTime12h(activeSession.startTime)} – {formatTime12h(activeSession.endTime)}, {activeSession.durationMin} min)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Venue: {activeSession.venue}</span>
                </div>

                {/* UHS Auto-Tag Line */}
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  UHS Curriculum Auto-Tag:{' '}
                  <strong className="font-medium text-slate-800 dark:text-slate-200">
                    {sessionCurriculumTag.block?.name || 'Clinical Clerkship'}
                    {sessionCurriculumTag.module ? ` — ${sessionCurriculumTag.module.name}` : ''}
                  </strong>
                  {activeSession.clinicalSubtype && (
                    <span> · Sub-type: {activeSession.clinicalSubtype.replace('_', ' ').toUpperCase()}</span>
                  )}
                </div>
              </div>

              {/* Quick Topic Input */}
              <div className="w-full lg:w-96">
                <label
                  htmlFor="session-topic-input"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1"
                >
                  Topic Covered (Required)
                </label>
                <input
                  id="session-topic-input"
                  type="text"
                  disabled={!canTeacherEditNow && !showAdminEditModal}
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Sticky Bulk Action & Search Bar (Spec Section 5.9 item 2, 3, 4) */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canTeacherEditNow}
                  onClick={() => handleBulkSet('P')}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-md hover:bg-emerald-100 disabled:opacity-40 min-h-[38px]"
                >
                  Mark All Present (P)
                </button>
                <button
                  type="button"
                  disabled={!canTeacherEditNow}
                  onClick={() => handleBulkSet('A')}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-md hover:bg-rose-100 disabled:opacity-40 min-h-[38px]"
                >
                  Mark All Absent (A)
                </button>
                <button
                  type="button"
                  disabled={!canTeacherEditNow}
                  onClick={() => handleBulkSet('P')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 min-h-[38px]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400 hidden xl:inline ml-2">
                  Tap student row to cycle P → A → L → E · Keyboard: ↑↓ arrows + P/A/L/E keys
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    aria-label="Filter roster by roll number or student name"
                    placeholder="Filter by roll # or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* List vs Compact Roll Grid Toggle */}
                <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-label="Roster List View"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded ${
                      viewMode === 'list'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="Compact Roll Number Grid View"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded ${
                      viewMode === 'grid'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span>Roll Grid</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Roster Content: List View or Compact Roll Number Grid View */}
          {viewMode === 'grid' ? (
            <div className="p-5">
              <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Fast Mobile Roll Grid — Tap any roll tile to cycle P (Green) → A (Red) → L (Amber) → E (Blue)
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5">
                {filteredRoster.map((stu) => {
                  const st = localMarks[stu.id]?.status || 'P';
                  const tileStyles: Record<AttendanceStatus, string> = {
                    P: 'bg-emerald-50 border-emerald-400 text-emerald-900 dark:bg-emerald-950/70 dark:border-emerald-700 dark:text-emerald-200',
                    A: 'bg-rose-50 border-rose-400 text-rose-900 dark:bg-rose-950/70 dark:border-rose-700 dark:text-rose-200',
                    L: 'bg-amber-50 border-amber-400 text-amber-900 dark:bg-amber-950/70 dark:border-amber-700 dark:text-amber-200',
                    E: 'bg-sky-50 border-sky-400 text-sky-900 dark:bg-sky-950/70 dark:border-sky-700 dark:text-sky-200',
                    M: 'bg-slate-100 border-slate-400 text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200',
                  };

                  return (
                    <button
                      key={stu.id}
                      type="button"
                      disabled={!canTeacherEditNow && !showAdminEditModal}
                      onClick={() => handleCycleStatus(stu.id)}
                      className={`p-2.5 rounded-md border-2 flex flex-col items-center justify-center min-h-[60px] transition-transform active:scale-95 ${tileStyles[st]} disabled:opacity-60`}
                    >
                      <span className="text-sm font-bold font-mono-tabular">
                        #{String(stu.rollNo || 0).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] font-mono-tabular font-semibold mt-0.5">
                        {st}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredRoster.map((stu, idx) => {
                const mark = localMarks[stu.id] || { status: 'P' as AttendanceStatus };
                const isFocused = idx === focusedIndex;

                return (
                  <div
                    key={stu.id}
                    onClick={() => {
                      setFocusedIndex(idx);
                      if (canTeacherEditNow || showAdminEditModal) {
                        handleCycleStatus(stu.id);
                      }
                    }}
                    className={`px-5 py-3 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                      isFocused
                        ? 'bg-slate-50 dark:bg-slate-800/60'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Large Roll Number Badge */}
                      <div className="w-11 h-11 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400 leading-none">
                          Roll
                        </span>
                        <span className="text-sm font-bold font-mono-tabular text-slate-900 dark:text-slate-100 mt-0.5">
                          {String(stu.rollNo || 0).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {stu.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          <span className="font-mono-tabular">{stu.regNo}</span>
                          <span aria-hidden="true"> · </span>
                          <span>S/D of {stu.fatherName}</span>
                          {mark.remark && (
                            <span className="ml-2 text-sky-700 dark:text-sky-400 font-medium">
                              · Note: &ldquo;{mark.remark}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Direct Status Controls (44px+ Mobile Friendly Touch Target) */}
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="hidden sm:flex items-center gap-1">
                        {(['P', 'A', 'L', 'E'] as AttendanceStatus[]).map((code) => {
                          const isSelected = mark.status === code;
                          return (
                            <button
                              key={code}
                              type="button"
                              disabled={!canTeacherEditNow && !showAdminEditModal}
                              onClick={() =>
                                updateStudentMark(
                                  stu.id,
                                  code,
                                  code === 'E' ? mark.remark || 'Approved leave' : undefined
                                )
                              }
                              aria-label={`Mark Roll ${stu.rollNo} ${code}`}
                              className={`w-9 h-9 rounded font-mono-tabular text-xs font-bold border transition-colors ${
                                isSelected
                                  ? code === 'P'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : code === 'A'
                                      ? 'bg-rose-600 text-white border-rose-600'
                                      : code === 'L'
                                        ? 'bg-amber-500 text-white border-amber-500'
                                        : 'bg-sky-600 text-white border-sky-600'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                              } disabled:opacity-50`}
                            >
                              {code}
                            </button>
                          );
                        })}
                      </div>

                      <div className="sm:hidden" onClick={() => handleCycleStatus(stu.id)}>
                        <AttendanceStatusCell status={mark.status} size="lg" />
                      </div>

                      <button
                        type="button"
                        disabled={!canTeacherEditNow && !showAdminEditModal}
                        onClick={() => {
                          setRemarkModalStudentId(stu.id);
                          setRemarkStatus(mark.status === 'E' ? 'E' : 'M');
                          setRemarkText(mark.remark || 'Verified medical leave certificate');
                        }}
                        className="px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                        title="Set Medical Leave (M) or add remark"
                      >
                        M / Note
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sticky Live Counters & Submit Footer (Spec Section 5.9 item 5) */}
          <div className="px-5 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono-tabular">
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                P: {liveCounts.P}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-rose-700 dark:text-rose-400">
                A: {liveCounts.A}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-amber-700 dark:text-amber-400">
                L: {liveCounts.L}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-sky-700 dark:text-sky-400">
                E: {liveCounts.E}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">
                M: {liveCounts.M}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Total: {liveCounts.total}
              </span>
            </div>

            {canTeacherEditNow && (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSaveDraftClick}
                  className="px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(true)}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 rounded-md transition-colors"
                >
                  {activeSession.state === 'submitted' ? 'Update Submitted Register' : 'Submit Attendance'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center space-y-3">
          <div className="text-base font-bold text-slate-900 dark:text-slate-100">
            No Sessions Logged for {activeSection?.name || 'This Section'} Yet
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Click below to log a session (date, time, topic covered) and snapshot the enrolled student roster.
          </p>
          <button
            type="button"
            onClick={handleOpenNewSession}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
          >
            <Plus className="w-4 h-4" />
            <span>Start First Session</span>
          </button>
        </div>
      )}

      {/* Submit Confirmation Modal (Spec Section 5.9 item 7: shows counts & absentee roll numbers) */}
      {showSubmitConfirm && activeSession && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-confirm-title"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 id="submit-confirm-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
              Confirm Attendance Submission
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Please verify the counts and absentee roll numbers before submitting. Once submitted, this register remains editable for {settings.lockHours} hours before locking.
            </p>

            <div className="grid grid-cols-5 gap-2 p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center font-mono-tabular">
              <div>
                <div className="text-[11px] text-slate-500">Present</div>
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-400">{liveCounts.P}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Absent</div>
                <div className="text-base font-bold text-rose-700 dark:text-rose-400">{liveCounts.A}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Late</div>
                <div className="text-base font-bold text-amber-700 dark:text-amber-400">{liveCounts.L}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Excused</div>
                <div className="text-base font-bold text-sky-700 dark:text-sky-400">{liveCounts.E}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Medical</div>
                <div className="text-base font-bold text-slate-700 dark:text-slate-300">{liveCounts.M}</div>
              </div>
            </div>

            <div className="text-xs space-y-1">
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                Absentees by Roll Number ({liveCounts.absentRolls.length}):
              </div>
              <div className="p-2.5 rounded bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 font-mono-tabular text-rose-800 dark:text-rose-200">
                {liveCounts.absentRolls.length > 0
                  ? liveCounts.absentRolls.map((r) => `Roll #${r}`).join(', ')
                  : 'None (100% Present/Late/Excused)'}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                Review Again
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
              >
                Confirm &amp; Submit Register
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Medical (M) / Excused (E) Remark Modal */}
      {remarkModalStudentId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-sm w-full p-5 space-y-4 shadow-xl"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Set Medical Leave (M) or Excused (E) Note
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Status Code
                </label>
                <select
                  value={remarkStatus}
                  onChange={(e) => setRemarkStatus(e.target.value as AttendanceStatus)}
                  className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="M">M — Medical Leave (Requires Reason)</option>
                  <option value="E">E — Excused / Official Leave (Requires Reason)</option>
                  <option value="L">L — Late Arrival</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Mandatory Remark / Reference *
                </label>
                <input
                  type="text"
                  required
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                  placeholder="e.g., Medical certificate verified by DME"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemarkModalStudentId(null)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  updateStudentMark(remarkModalStudentId, remarkStatus, remarkText.trim() || 'Verified leave');
                  setRemarkModalStudentId(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded"
              >
                Apply Status &amp; Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start New Session Modal */}
      {showNewSessionModal && activeClass && activeSection && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-session-modal-title"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 id="new-session-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                Log New Class Session — {activeSection.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewSessionModal(false)}
                className="text-xs font-medium text-slate-500"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateSessionSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Session Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    End Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
              </div>

              {activeClass.classType === 'clinical' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Clinical Sub-Type
                    </label>
                    <select
                      value={newClinicalSubtype}
                      onChange={(e) => setNewClinicalSubtype(e.target.value as ClinicalSubtype)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                    >
                      <option value="ward_round">Ward Round</option>
                      <option value="bedside_teaching">Bedside Teaching</option>
                      <option value="opd">Outpatient Dept (OPD)</option>
                      <option value="ot">Operation Theatre (OT)</option>
                      <option value="emergency_duty">Emergency Duty</option>
                      <option value="case_presentation">Case Presentation / CPC</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Hospital Ward / Location
                    </label>
                    <select
                      value={newLocationId}
                      onChange={(e) => setNewLocationId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                    >
                      {hospitalLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Topic Covered * (Click a recent curriculum topic below or type)
                </label>
                <input
                  type="text"
                  required
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="Enter lecture, practical, or ward teaching topic..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(QUICK_TOPICS[activeClass.classType] || QUICK_TOPICS.lecture).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewTopic(t)}
                      className="px-2 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 text-left truncate max-w-full"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Initial Roster Default Status
                  </label>
                  <select
                    value={newDefaultStatus}
                    onChange={(e) => setNewDefaultStatus(e.target.value as 'P' | 'A')}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="P">All Present (P) — Tap Absentees</option>
                    <option value="A">All Absent (A) — Tap Present</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Venue / Hall
                  </label>
                  <input
                    type="text"
                    value={newVenue}
                    onChange={(e) => setNewVenue(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsSubstitute}
                    onChange={(e) => setNewIsSubstitute(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Conducted as Substitute Teacher</span>
                </label>
              </div>

              {newDate === '2026-11-09' && (
                <div>
                  <label className="block font-medium text-amber-700 dark:text-amber-400 mb-1">
                    Holiday Override Reason (Iqbal Day Public Holiday) *
                  </label>
                  <input
                    type="text"
                    required
                    value={holidayOverrideReason}
                    onChange={(e) => setHolidayOverrideReason(e.target.value)}
                    placeholder="Reason for extra make-up session on holiday"
                    className="w-full px-3 py-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-400 rounded-md"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
                  className="px-4 py-2 font-medium border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Create Session &amp; Snapshot Roster
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Raise Post-Lock Correction Request Modal (Spec Section 5.4 & 6.4) */}
      {showCorrectionModal && activeSession && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Request Post-Lock Attendance Correction
              </h3>
              <button
                type="button"
                onClick={() => setShowCorrectionModal(false)}
                className="text-xs font-medium text-slate-500"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select the student(s) whose status needs correction and state the official reason. Requests go to the Campus Admin / HOD approval queue.
            </p>
            <form onSubmit={handleRaiseCorrectionSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Correction Request *
                </label>
                <input
                  type="text"
                  required
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g., Official UHS sports/academic representation letter received"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
              <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-200 dark:divide-slate-800">
                {rosterStudents.map((stu) => {
                  const orig = localMarks[stu.id]?.status || 'P';
                  const edited = correctionEdits[stu.id] || orig;
                  return (
                    <div key={stu.id} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <span className="font-mono-tabular font-bold mr-2">#{stu.rollNo}</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{stu.name}</span>
                        <span className="ml-2 text-slate-500">(Current: {orig})</span>
                      </div>
                      <select
                        value={edited}
                        onChange={(e) =>
                          setCorrectionEdits((prev) => ({
                            ...prev,
                            [stu.id]: e.target.value as AttendanceStatus,
                          }))
                        }
                        className="px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-mono-tabular font-semibold"
                      >
                        <option value="P">P (Present)</option>
                        <option value="A">A (Absent)</option>
                        <option value="L">L (Late)</option>
                        <option value="E">E (Excused)</option>
                        <option value="M">M (Medical)</option>
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 font-medium border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Submit Correction Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Campus Admin Direct Locked Session Edit Modal */}
      {showAdminEditModal && activeSession && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Campus Admin Direct Override (Locked Session)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You can now click any student row behind this dialog or enter a mandatory audit reason below to commit your changes directly to the locked register.
            </p>
            <form onSubmit={handleAdminDirectEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mandatory Audit Log Reason *
                </label>
                <input
                  type="text"
                  required
                  value={adminEditReason}
                  onChange={(e) => setAdminEditReason(e.target.value)}
                  placeholder="e.g., Principal office approved medical leave post-lock"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdminEditModal(false)}
                  className="px-4 py-2 font-medium border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Save Audited Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
