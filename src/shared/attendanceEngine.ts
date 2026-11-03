import {
  AttendanceCounts,
  AttendanceResult,
  BatchCurriculumDate,
  CampusSettings,
  CurriculumBlock,
  CurriculumModule,
  Enrollment,
  RoleAssignment,
  Session,
  User,
} from './types';

/**
 * Single shared attendance calculation engine (Section 5.5, 5.7, Prompt 9).
 * All screens, cards, registers, shortage lists, and reports MUST use this function.
 */
export function calculateAttendance(
  counts: AttendanceCounts,
  settings: Pick<
    CampusSettings,
    | 'thresholdPct'
    | 'warningPct'
    | 'lateRule'
    | 'lateToAbsentN'
    | 'excusedRule'
    | 'calcBasis'
  >,
  thresholdOverride?: number
): AttendanceResult {
  const effectiveThreshold = thresholdOverride ?? settings.thresholdPct;
  const warningThreshold = Math.max(effectiveThreshold, settings.warningPct);

  const lateToAbsentN = Math.max(1, settings.lateToAbsentN || 3);
  const latePenaltyCount =
    settings.lateRule === 'n_lates_one_absence'
      ? Math.floor(counts.late / lateToAbsentN)
      : 0;

  if (settings.calcBasis === 'hours') {
    const avgSessionMin =
      counts.held > 0 ? counts.minutesHeld / counts.held : 60;
    const excusedOrMedMin =
      counts.minutesExcusedOrMedical !== undefined
        ? counts.minutesExcusedOrMedical
        : (counts.excused + counts.medical) * avgSessionMin;

    const penaltyMinutes = latePenaltyCount * avgSessionMin;

    const denominatorMin =
      settings.excusedRule === 'exclude'
        ? Math.max(0, counts.minutesHeld - excusedOrMedMin)
        : counts.minutesHeld;

    const attendedMin =
      settings.excusedRule === 'present'
        ? Math.max(0, counts.minutesAttended - penaltyMinutes + excusedOrMedMin)
        : Math.max(0, counts.minutesAttended - penaltyMinutes);

    const denominatorHours = Math.round((denominatorMin / 60) * 10) / 10;
    const attendedHours = Math.round((attendedMin / 60) * 10) / 10;

    if (denominatorMin <= 0) {
      return {
        attended: 0,
        denominator: 0,
        pct: null,
        band: 'no_sessions',
      };
    }

    const rawPct = (attendedMin / denominatorMin) * 100;
    const pct = Math.min(100, Math.round(rawPct * 10) / 10);

    const band =
      pct < effectiveThreshold
        ? 'shortage'
        : pct < warningThreshold
          ? 'at_risk'
          : 'ok';

    return {
      attended: attendedHours,
      denominator: denominatorHours,
      pct,
      band,
    };
  }

  // Session count basis
  const totalExcusedAndMedical = counts.excused + counts.medical;
  const denominator =
    settings.excusedRule === 'exclude'
      ? Math.max(0, counts.held - totalExcusedAndMedical)
      : counts.held;

  if (denominator <= 0) {
    return {
      attended: 0,
      denominator: 0,
      pct: null,
      band: 'no_sessions',
    };
  }

  const baseAttended = Math.max(0, counts.present + counts.late - latePenaltyCount);
  const attended =
    settings.excusedRule === 'present'
      ? baseAttended + totalExcusedAndMedical
      : baseAttended;

  const rawPct = (attended / denominator) * 100;
  const pct = Math.min(100, Math.round(rawPct * 10) / 10);

  const band =
    pct < effectiveThreshold
      ? 'shortage'
      : pct < warningThreshold
        ? 'at_risk'
        : 'ok';

  return {
    attended,
    denominator,
    pct,
    band,
  };
}

/**
 * Action-by-role permission matrix (Section 3, Pages 6-9).
 * Department Heads (HOD) are view-and-approve roles: they NEVER create or assign
 * classes, teachers, sections, groups, rotations, or substitutes.
 */
export type PermissionAction =
  | 'manage_campuses'
  | 'edit_campus_settings'
  | 'manage_users'
  | 'manage_academics'
  | 'view_academics'
  | 'select_hod'
  | 'manage_students'
  | 'view_sensitive_pii'
  | 'manage_staff'
  | 'create_or_assign_classes'
  | 'manage_groups_and_sections'
  | 'plan_teaching_slots'
  | 'plan_clinical_rotations'
  | 'assign_substitute'
  | 'create_or_mark_session'
  | 'edit_locked_session'
  | 'raise_correction'
  | 'approve_correction'
  | 'view_reports'
  | 'view_village_overview'
  | 'view_audit_log';

export interface PermissionResource {
  campusId?: string | null;
  departmentId?: string | null;
  assignedStaffIds?: string[];
  currentUserStaffId?: string | null;
  hodCanApprove?: boolean;
}

export function can(
  user: User | null | undefined,
  userRoles: RoleAssignment[],
  action: PermissionAction,
  resource: PermissionResource = {}
): boolean {
  if (!user || !user.isActive) return false;

  const isSuperAdmin = userRoles.some((r) => r.role === 'SUPER_ADMIN');
  if (isSuperAdmin) {
    // Super Admin can perform all administrative actions across the village
    return true;
  }

  // Filter roles matching the target campus
  const campusRoles = resource.campusId
    ? userRoles.filter((r) => r.campusId === resource.campusId)
    : userRoles;

  if (campusRoles.length === 0) return false;

  const isCampusAdmin = campusRoles.some((r) => r.role === 'CAMPUS_ADMIN');
  const isPrincipal = campusRoles.some((r) => r.role === 'PRINCIPAL');
  const hodRoles = campusRoles.filter((r) => r.role === 'HOD');
  const isHodForDept =
    hodRoles.length > 0 &&
    (!resource.departmentId ||
      hodRoles.some((r) => !r.departmentId || r.departmentId === resource.departmentId));
  const isTeacher = campusRoles.some((r) => r.role === 'TEACHER');

  switch (action) {
    case 'manage_campuses':
    case 'view_village_overview':
      return false; // Super Admin only

    case 'edit_campus_settings':
    case 'manage_users':
    case 'manage_academics':
    case 'select_hod':
    case 'manage_students':
    case 'view_sensitive_pii':
    case 'manage_staff':
    case 'create_or_assign_classes':
    case 'manage_groups_and_sections':
    case 'plan_teaching_slots':
    case 'plan_clinical_rotations':
    case 'assign_substitute':
    case 'edit_locked_session':
    case 'view_audit_log':
      // Strictly Campus Admin (and Super Admin). HODs can NEVER create/assign classes, teachers, sections, groups, rotations, or substitutes.
      return isCampusAdmin;

    case 'view_academics':
    case 'view_reports':
      return isCampusAdmin || isPrincipal || isHodForDept || isTeacher;

    case 'create_or_mark_session':
      if (isCampusAdmin) return true;
      if (!isTeacher) return false;
      if (!resource.assignedStaffIds || resource.assignedStaffIds.length === 0) {
        return true;
      }
      return (
        !!resource.currentUserStaffId &&
        resource.assignedStaffIds.includes(resource.currentUserStaffId)
      );

    case 'raise_correction':
      return isTeacher || isCampusAdmin;

    case 'approve_correction':
      if (isCampusAdmin) return true;
      if (isHodForDept && resource.hodCanApprove) return true;
      return false;

    default:
      return false;
  }
}

/**
 * UHS Curriculum Block & Module Auto-Tagging (Section 4.9, Prompt 3).
 * Returns the active block and non-spiral module running on a given date for a batch.
 */
export function getCurriculumTag(
  batchId: string,
  dateStr: string,
  blocks: CurriculumBlock[],
  modules: CurriculumModule[],
  batchDates: BatchCurriculumDate[]
): {
  block: CurriculumBlock | null;
  module: CurriculumModule | null;
  examDate?: string;
} {
  const matchingEntries = batchDates.filter(
    (d) =>
      d.batchId === batchId &&
      d.startDate <= dateStr &&
      d.endDate >= dateStr
  );

  if (matchingEntries.length === 0) {
    return { block: null, module: null };
  }

  // Prefer non-spiral module entry first
  for (const entry of matchingEntries) {
    if (entry.moduleId) {
      const mod = modules.find((m) => m.id === entry.moduleId);
      if (mod && !mod.isSpiral) {
        const blk = blocks.find((b) => b.id === mod.blockId) ?? null;
        return { block: blk, module: mod, examDate: entry.examDate };
      }
    }
  }

  // Fallback to block-level entry
  const firstEntry = matchingEntries[0];
  const block = blocks.find((b) => b.id === firstEntry.blockId) ?? null;
  const mod = firstEntry.moduleId
    ? modules.find((m) => m.id === firstEntry.moduleId) ?? null
    : null;

  return { block, module: mod, examDate: firstEntry.examDate };
}

/**
 * Checks whether two HH:mm time intervals overlap on the same date.
 */
export function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA < endB && startB < endA;
}

/**
 * Student, Teacher, Section, and Venue Clash Detection (Section 4.10, 7.3, Prompt 6A).
 */
export interface ClashCandidate {
  id?: string;
  campusId: string;
  sectionId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  conductedByStaffId: string;
  venue: string;
}

export interface ClashCheckResult {
  hasClash: boolean;
  reason?: string;
  clashingSessionId?: string;
}

export function detectSessionClash(
  candidate: ClashCandidate,
  existingSessions: Session[],
  enrollments: Enrollment[]
): ClashCheckResult {
  const liveSessionsSameDay = existingSessions.filter(
    (s) =>
      s.campusId === candidate.campusId &&
      s.state !== 'cancelled' &&
      s.sessionDate === candidate.sessionDate &&
      s.id !== candidate.id &&
      timesOverlap(candidate.startTime, candidate.endTime, s.startTime, s.endTime)
  );

  if (liveSessionsSameDay.length === 0) {
    return { hasClash: false };
  }

  // 1. Same section overlap check
  const sectionClash = liveSessionsSameDay.find(
    (s) => s.sectionId === candidate.sectionId
  );
  if (sectionClash) {
    return {
      hasClash: true,
      reason: `Section already has a live session (${sectionClash.startTime}–${sectionClash.endTime}: "${sectionClash.topic}").`,
      clashingSessionId: sectionClash.id,
    };
  }

  // 2. Teacher clash check
  const teacherClash = liveSessionsSameDay.find(
    (s) => s.conductedByStaffId === candidate.conductedByStaffId
  );
  if (teacherClash) {
    return {
      hasClash: true,
      reason: `Teacher is already conducting another session (${teacherClash.startTime}–${teacherClash.endTime}: "${teacherClash.topic}").`,
      clashingSessionId: teacherClash.id,
    };
  }

  // 3. Venue clash check (when venue is specified)
  const cleanVenue = candidate.venue.trim().toLowerCase();
  if (cleanVenue.length > 0) {
    const venueClash = liveSessionsSameDay.find(
      (s) => s.venue.trim().toLowerCase() === cleanVenue
    );
    if (venueClash) {
      return {
        hasClash: true,
        reason: `Venue "${candidate.venue}" is already booked (${venueClash.startTime}–${venueClash.endTime}: "${venueClash.topic}").`,
        clashingSessionId: venueClash.id,
      };
    }
  }

  // 4. Student clash check across all active enrolments on that date
  const candidateStudentIds = new Set(
    enrollments
      .filter(
        (e) =>
          e.sectionId === candidate.sectionId &&
          e.effectiveFrom <= candidate.sessionDate &&
          (!e.effectiveTo || e.effectiveTo >= candidate.sessionDate)
      )
      .map((e) => e.studentId)
  );

  if (candidateStudentIds.size > 0) {
    for (const otherSession of liveSessionsSameDay) {
      const otherStudents = enrollments.filter(
        (e) =>
          e.sectionId === otherSession.sectionId &&
          e.effectiveFrom <= candidate.sessionDate &&
          (!e.effectiveTo || e.effectiveTo >= candidate.sessionDate) &&
          candidateStudentIds.has(e.studentId)
      );
      if (otherStudents.length > 0) {
        return {
          hasClash: true,
          reason: `${otherStudents.length} student(s) in this section are already scheduled in an overlapping session (${otherSession.startTime}–${otherSession.endTime}: "${otherSession.topic}").`,
          clashingSessionId: otherSession.id,
        };
      }
    }
  }

  return { hasClash: false };
}

/**
 * Session lock window evaluator (Section 5.2, Prompt 8).
 */
export function getSessionLockStatus(
  session: Pick<Session, 'state' | 'sessionDate' | 'endTime' | 'submittedAt' | 'lockedAt'>,
  lockHours: number,
  nowDate: Date = new Date('2026-11-02T14:30:00+05:00')
): {
  isLocked: boolean;
  remainingMinutes: number;
  remainingLabel: string;
} {
  if (session.state === 'locked') {
    return { isLocked: true, remainingMinutes: 0, remainingLabel: 'Locked' };
  }
  if (session.state !== 'submitted') {
    return { isLocked: false, remainingMinutes: lockHours * 60, remainingLabel: 'Draft' };
  }

  // Parse session end time in PKT (+05:00)
  const sessionEndIso = `${session.sessionDate}T${session.endTime}:00+05:00`;
  const sessionEndMs = Date.parse(sessionEndIso);
  if (Number.isNaN(sessionEndMs)) {
    return { isLocked: false, remainingMinutes: lockHours * 60, remainingLabel: `${lockHours}h remaining` };
  }

  const lockDeadlineMs = sessionEndMs + lockHours * 3600 * 1000;
  const diffMs = lockDeadlineMs - nowDate.getTime();
  if (diffMs <= 0) {
    return { isLocked: true, remainingMinutes: 0, remainingLabel: 'Lock window elapsed' };
  }

  const remainingMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  return {
    isLocked: false,
    remainingMinutes,
    remainingLabel: `Editable for ${hours} h ${mins} min`,
  };
}

/**
 * Formats YYYY-MM-DD as DD-MMM-YYYY (e.g., 02-Nov-2026) per ABWA spec Section 4.1 & 9.4.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDatePKT(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const monthName = MONTHS[monthIdx] ?? parts[1];
  return `${day}-${monthName}-${year}`;
}

/**
 * Formats 24-hour HH:mm into 12-hour clock (e.g. "09:00 AM") per spec Section 9.4.
 */
export function formatTime12h(time24?: string | null): string {
  if (!time24) return '—';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return time24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${mStr || '00'} ${suffix}`;
}

/**
 * Formats 13-digit CNIC as 00000-0000000-0 and validates format.
 */
export function formatCNIC(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

export function isValidCNIC(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 13;
}
