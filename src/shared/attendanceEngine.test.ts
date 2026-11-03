import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAttendance,
  can,
  detectSessionClash,
  formatCNIC,
  formatDatePKT,
  getCurriculumTag,
} from './attendanceEngine';
import { CampusSettings, RoleAssignment, User } from './types';

const baseSettings: CampusSettings = {
  campusId: 'campus-amc',
  thresholdPct: 75,
  warningPct: 80,
  clinicalThresholdPct: 75,
  lockHours: 24,
  backdateDays: 7,
  lateRule: 'present',
  lateToAbsentN: 3,
  excusedRule: 'exclude',
  calcBasis: 'sessions',
  hodCanApprove: true,
  countEmergencyDuty: true,
  allowAdhocGroupSessions: true,
  regNoPattern: 'AMC-MBBS-{YY}-{###}',
  rollNoPattern: '{###}',
  staffCodePattern: 'AMC-F-{####}',
};

test('Section 5.7 Worked Example 1: P30 L3 A3 M2 held 38 -> 91.7% OK (late present, medical excluded)', () => {
  const res = calculateAttendance(
    {
      held: 38,
      present: 30,
      late: 3,
      absent: 3,
      excused: 0,
      medical: 2,
      minutesHeld: 38 * 120,
      minutesAttended: 33 * 120,
    },
    baseSettings
  );

  assert.equal(res.attended, 33);
  assert.equal(res.denominator, 36);
  assert.equal(res.pct, 91.7);
  assert.equal(res.band, 'ok');
});

test('Section 5.7 Worked Example 2: P30 L3 A3 M2 held 38 -> 88.9% OK (3 lates = 1 absence, medical excluded)', () => {
  const res = calculateAttendance(
    {
      held: 38,
      present: 30,
      late: 3,
      absent: 3,
      excused: 0,
      medical: 2,
      minutesHeld: 38 * 120,
      minutesAttended: 33 * 120,
    },
    {
      ...baseSettings,
      lateRule: 'n_lates_one_absence',
      lateToAbsentN: 3,
    }
  );

  assert.equal(res.attended, 32);
  assert.equal(res.denominator, 36);
  assert.equal(res.pct, 88.9);
  assert.equal(res.band, 'ok');
});

test('Section 5.7 Worked Example 3: P30 L3 A3 M2 held 38 -> 92.1% OK (medical counted present)', () => {
  const res = calculateAttendance(
    {
      held: 38,
      present: 30,
      late: 3,
      absent: 3,
      excused: 0,
      medical: 2,
      minutesHeld: 38 * 120,
      minutesAttended: 33 * 120,
    },
    {
      ...baseSettings,
      excusedRule: 'present',
    }
  );

  assert.equal(res.attended, 35);
  assert.equal(res.denominator, 38);
  assert.equal(res.pct, 92.1);
  assert.equal(res.band, 'ok');
});

test('Section 5.7 Worked Example 4: Combined Course by sessions (77.9% At risk) vs contact hours (82.0% OK)', () => {
  // Practical (38 held x 2h = 76h; M=2 -> 4h excluded -> 72h; P30+L3 = 33 x 2h = 66h)
  // Lecture (50 held x 1h = 50h; P34 = 34h)
  const combinedCounts = {
    held: 88,
    present: 64,
    late: 3,
    absent: 19,
    excused: 0,
    medical: 2,
    minutesHeld: (76 + 50) * 60,
    minutesAttended: (66 + 34) * 60,
    minutesExcusedOrMedical: 4 * 60,
  };

  const bySessions = calculateAttendance(combinedCounts, baseSettings);
  assert.equal(bySessions.attended, 67);
  assert.equal(bySessions.denominator, 86);
  assert.equal(bySessions.pct, 77.9);
  assert.equal(bySessions.band, 'at_risk');

  const byHours = calculateAttendance(combinedCounts, {
    ...baseSettings,
    calcBasis: 'hours',
  });
  assert.equal(byHours.attended, 100);
  assert.equal(byHours.denominator, 122);
  assert.equal(byHours.pct, 82.0);
  assert.equal(byHours.band, 'ok');
});

test('Zero held or all excused returns null pct and no_sessions band', () => {
  const zeroHeld = calculateAttendance(
    {
      held: 0,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      medical: 0,
      minutesHeld: 0,
      minutesAttended: 0,
    },
    baseSettings
  );
  assert.equal(zeroHeld.pct, null);
  assert.equal(zeroHeld.band, 'no_sessions');

  const allExcused = calculateAttendance(
    {
      held: 5,
      present: 0,
      late: 0,
      absent: 0,
      excused: 3,
      medical: 2,
      minutesHeld: 300,
      minutesAttended: 0,
    },
    baseSettings
  );
  assert.equal(allExcused.pct, null);
  assert.equal(allExcused.band, 'no_sessions');
});

test('RBAC permissions enforce campus isolation and HOD view-and-approve limits', () => {
  const hodUser: User = {
    id: 'u-hod',
    email: 'hod.anatomy@abwa.edu.pk',
    name: 'Prof. Dr. Kamran Qureshi',
    phone: '0300-1112233',
    isActive: true,
    lastLoginAt: '2026-11-02T08:00:00Z',
  };
  const hodRoles: RoleAssignment[] = [
    {
      id: 'r-1',
      userId: 'u-hod',
      role: 'HOD',
      campusId: 'campus-amc',
      departmentId: 'dept-anat',
    },
  ];

  // HOD can view reports in own department/campus
  assert.equal(
    can(hodUser, hodRoles, 'view_reports', {
      campusId: 'campus-amc',
      departmentId: 'dept-anat',
    }),
    true
  );

  // HOD can NEVER create or assign classes, teachers, sections, groups, or rotations
  assert.equal(
    can(hodUser, hodRoles, 'create_or_assign_classes', { campusId: 'campus-amc' }),
    false
  );
  assert.equal(
    can(hodUser, hodRoles, 'manage_groups_and_sections', { campusId: 'campus-amc' }),
    false
  );

  // AMC user cannot access ANC campus data
  assert.equal(
    can(hodUser, hodRoles, 'view_reports', { campusId: 'campus-anc' }),
    false
  );
});

test('UHS Curriculum auto-tagging picks active non-spiral module', () => {
  const blocks = [
    {
      id: 'blk-1',
      campusId: 'campus-amc',
      versionId: 'v-2k23',
      blockNo: 1,
      name: 'Block-1 (Foundation & Blood)',
      yearOfStudy: 1,
    },
  ];
  const modules = [
    {
      id: 'mod-fnd',
      campusId: 'campus-amc',
      blockId: 'blk-1',
      code: 'FND-I',
      name: 'Foundation-I',
      sortOrder: 1,
      plannedWeeks: 6,
      isSpiral: false,
    },
    {
      id: 'mod-spiral',
      campusId: 'campus-amc',
      blockId: 'blk-1',
      code: 'BS-SPIRAL',
      name: 'Behavioural Sciences (Spiral)',
      sortOrder: 9,
      plannedWeeks: 36,
      isSpiral: true,
    },
  ];
  const batchDates = [
    {
      id: 'bd-spiral',
      campusId: 'campus-amc',
      batchId: 'batch-2026',
      blockId: 'blk-1',
      moduleId: 'mod-spiral',
      startDate: '2026-10-01',
      endDate: '2027-06-30',
    },
    {
      id: 'bd-fnd',
      campusId: 'campus-amc',
      batchId: 'batch-2026',
      blockId: 'blk-1',
      moduleId: 'mod-fnd',
      startDate: '2026-10-15',
      endDate: '2026-11-30',
    },
  ];

  const tag = getCurriculumTag('batch-2026', '2026-11-02', blocks, modules, batchDates);
  assert.equal(tag.block?.name, 'Block-1 (Foundation & Blood)');
  assert.equal(tag.module?.name, 'Foundation-I');
});

test('Session clash detection blocks overlapping section, teacher, venue, or student', () => {
  const existing: any[] = [
    {
      id: 'sess-1',
      campusId: 'campus-amc',
      classId: 'cls-anat',
      sectionId: 'sec-a',
      sessionDate: '2026-11-02',
      startTime: '09:00',
      endTime: '10:00',
      durationMin: 60,
      sessionType: 'lecture',
      topic: 'Brachial Plexus',
      conductedByStaffId: 'staff-1',
      isSubstitute: false,
      venue: 'Lecture Hall 1',
      state: 'submitted',
      version: 1,
    },
  ];

  const clashVenue = detectSessionClash(
    {
      campusId: 'campus-amc',
      sectionId: 'sec-b',
      sessionDate: '2026-11-02',
      startTime: '09:30',
      endTime: '10:30',
      conductedByStaffId: 'staff-2',
      venue: 'Lecture Hall 1',
    },
    existing,
    []
  );
  assert.equal(clashVenue.hasClash, true);
  assert.equal(formatDatePKT('2026-11-02'), '02-Nov-2026');
  assert.equal(formatCNIC('3310012345671'), '33100-1234567-1');
});
