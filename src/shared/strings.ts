/**
 * Centralized English UI Strings (Section 9.4 & Prompt 1:
 * "English UI; all text in one strings file so Urdu can be added later")
 */
export const STRINGS = {
  brandName: 'ABWA Knowledge Village',
  systemSubtitle: 'Campus Management System — Core & Student Attendance',
  nav: {
    dashboard: 'Dashboard',
    takeAttendance: 'Take Attendance',
    reports: 'Reports & Registers',
    academics: 'Academics & Groups',
    people: 'Registration & Staff',
    governance: 'Corrections & Settings',
  },
  statusLabels: {
    P: 'Present',
    A: 'Absent',
    L: 'Late',
    E: 'Excused / Leave',
    M: 'Medical Leave',
  },
  bands: {
    ok: 'Eligible (OK)',
    at_risk: 'At Risk (Warning)',
    shortage: 'Shortage (< Threshold)',
    no_sessions: 'No Sessions',
  },
  roles: {
    SUPER_ADMIN: 'Village Super Admin',
    CAMPUS_ADMIN: 'Campus Administrator',
    PRINCIPAL: 'Principal / Viewer',
    HOD: 'Head of Department',
    TEACHER: 'Faculty / Clinical Supervisor',
    STUDENT: 'Student',
    PARENT: 'Parent',
  },
  emptyStates: {
    noSessions: 'No attendance sessions logged for this filter yet. Start a session to record student attendance.',
    noShortage: 'All students in the selected filter meet the required attendance threshold.',
    noCorrections: 'No pending post-lock attendance correction requests in the queue.',
  },
};
