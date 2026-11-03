/**
 * ABWA Campus Management System — Shared Domain Types
 * Covers all Phase 1 Core + Student Attendance entities (46-table relational model)
 */

export type RoleType =
  | 'SUPER_ADMIN'
  | 'CAMPUS_ADMIN'
  | 'PRINCIPAL'
  | 'HOD'
  | 'TEACHER'
  | 'STUDENT'
  | 'PARENT';

export type AttendanceStatus = 'P' | 'A' | 'L' | 'E' | 'M';

export type SessionState = 'draft' | 'submitted' | 'locked' | 'cancelled';

export type ClassType =
  | 'lecture'
  | 'tutorial'
  | 'practical'
  | 'sgd'
  | 'clinical'
  | 'skills_lab'
  | 'demonstration';

export type ClinicalSubtype =
  | 'ward_round'
  | 'bedside_teaching'
  | 'opd'
  | 'ot'
  | 'emergency_duty'
  | 'case_presentation'
  | 'skills_lab';

export type DepartmentType = 'basic_science' | 'para_clinical' | 'clinical' | 'support';
export type DepartmentLocation = 'college' | 'hospital';

export type StaffCategory =
  | 'teaching'
  | 'clinical'
  | 'academic_support'
  | 'technical'
  | 'administrative';

export type StudentRegistrationState =
  | 'draft'
  | 'submitted'
  | 'verified'
  | 'returned'
  | 'active'
  | 'freeze'
  | 'struck_off'
  | 'left'
  | 'graduated';

export interface Organization {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
}

export interface Campus {
  id: string;
  orgId: string;
  name: string;
  code: string; // e.g., AMC, ANC, AU
  type: 'college' | 'university';
  termType: 'annual' | 'semester';
  timezone: string;
  address: string;
  contact: string;
  status: 'active' | 'archived';
}

export interface CampusSettings {
  campusId: string;
  thresholdPct: number; // default 75
  warningPct: number; // default 80
  clinicalThresholdPct: number; // default 75
  lockHours: number; // default 24
  backdateDays: number; // default 7
  lateRule: 'present' | 'n_lates_one_absence';
  lateToAbsentN: number; // default 3
  excusedRule: 'exclude' | 'present';
  calcBasis: 'sessions' | 'hours';
  hodCanApprove: boolean;
  countEmergencyDuty: boolean;
  allowAdhocGroupSessions: boolean;
  regNoPattern: string; // e.g., AMC-MBBS-{YY}-{###}
  rollNoPattern: string; // e.g., {###}
  staffCodePattern: string; // e.g., AMC-F-{####}
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  isActive: boolean;
  lastLoginAt: string;
}

export interface RoleAssignment {
  id: string;
  userId: string;
  role: RoleType;
  campusId: string | null; // null = organization level (SUPER_ADMIN)
  departmentId: string | null; // null = whole campus
}

export interface Department {
  id: string;
  campusId: string;
  code: string;
  name: string;
  deptType: DepartmentType;
  location: DepartmentLocation;
  parentDepartmentId: string | null;
  hodStaffId: string | null;
  extension?: string;
  status: 'active' | 'archived';
}

export interface DepartmentHeadHistory {
  id: string;
  campusId: string;
  departmentId: string;
  staffId: string;
  startDate: string;
  endDate: string | null;
  orderNo: string;
}

export interface HospitalLocation {
  id: string;
  campusId: string;
  departmentId: string;
  name: string;
  kind: 'ward' | 'opd' | 'ot' | 'er' | 'icu' | 'lab' | 'skills_lab' | 'room';
  floor: string;
  capacity: number;
}

export interface Program {
  id: string;
  campusId: string;
  departmentId: string | null;
  name: string;
  code: string;
  durationYears: number;
  status: 'active' | 'archived';
}

export interface Batch {
  id: string;
  campusId: string;
  programId: string;
  intakeYear: number;
  sessionLabel: string; // e.g. "2025-2030"
  yearClassLabel: string; // e.g. "1st Year MBBS (Batch 2026)"
  currentTermId: string;
  curriculumVersionId: string;
  status: 'active' | 'graduated' | 'archived';
}

export interface AcademicTerm {
  id: string;
  campusId: string;
  name: string;
  termType: 'annual' | 'semester';
  yearOrSemesterNo: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface CalendarEvent {
  id: string;
  campusId: string;
  startDate: string;
  endDate: string;
  type: 'holiday' | 'exam' | 'closure' | 'event';
  title: string;
}

export interface Course {
  id: string;
  campusId: string;
  departmentId: string;
  programId: string;
  code: string;
  title: string;
  yearOrSemester: number;
  creditHours?: number;
  components: ClassType[];
  status: 'active' | 'archived';
}

export interface CurriculumVersion {
  id: string;
  campusId: string;
  name: string; // e.g. "UHS Modular Integrated Curriculum 2K23"
  affiliatingBody: string; // "UHS Lahore"
  effectiveFrom: string;
}

export interface CurriculumBlock {
  id: string;
  campusId: string;
  versionId: string;
  blockNo: number;
  name: string;
  yearOfStudy: number;
}

export interface CurriculumModule {
  id: string;
  campusId: string;
  blockId: string;
  code: string;
  name: string;
  sortOrder: number;
  plannedWeeks: number;
  isSpiral: boolean;
}

export interface BatchCurriculumDate {
  id: string;
  campusId: string;
  batchId: string;
  blockId: string;
  moduleId: string | null;
  startDate: string;
  endDate: string;
  examDate?: string;
}

export interface Designation {
  id: string;
  campusId: string;
  category: StaffCategory;
  name: string;
  rankOrder: number;
}

export interface Staff {
  id: string;
  campusId: string;
  userId: string | null;
  staffCode: string;
  category: StaffCategory;
  designationId: string;
  primaryDepartmentId: string;
  secondaryDepartmentIds: string[];
  unitDepartmentId: string | null;
  name: string;
  fatherOrHusbandName: string;
  gender: 'Male' | 'Female';
  dob: string;
  cnic: string; // 13 digits
  mobile: string;
  officialEmail: string;
  employmentType: 'permanent' | 'contract' | 'visiting' | 'part_time' | 'adjunct';
  bpsGrade?: string;
  joiningDate: string;
  pmdcNo?: string;
  pmdcExpiry?: string;
  qualifications: string[];
  experienceYears: number;
  status: 'active' | 'on_leave' | 'resigned' | 'retired' | 'terminated';
}

export interface StudentDocumentItem {
  docType: string;
  originalSeen: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface Student {
  id: string;
  campusId: string;
  programId: string;
  batchId: string;
  registrationState: StudentRegistrationState;
  regNo: string | null; // Issued on activation
  rollNo: number | null; // Issued on activation
  name: string;
  fatherName: string;
  gender: 'Male' | 'Female';
  dob: string;
  cnic: string; // 13 digits
  nationality: string;
  domicileProvince: string;
  domicileDistrict: string;
  bloodGroup: string;
  mobile: string;
  whatsapp?: string;
  email: string;
  permanentAddress: string;
  city: string;
  guardianName: string;
  guardianRelation: string;
  guardianMobile: string;
  admissionDate: string;
  admissionCategory: 'Open Merit' | 'Self-Finance' | 'Overseas Pakistani' | 'Foreign';
  meritNo?: number;
  mdcatRollNo: string;
  mdcatScore: number;
  aggregatePct: number;
  matricObtained: number;
  matricTotal: number;
  fscObtained: number;
  fscTotal: number;
  uhsRegNo?: string;
  hostelResident: boolean;
  documents: StudentDocumentItem[];
  returnNote?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  activatedAt?: string;
}

export interface GroupSet {
  id: string;
  campusId: string;
  batchId: string;
  termId: string;
  name: string; // e.g., "Teaching Groups A-D"
  purpose: 'teaching' | 'clinical';
}

export interface StudentGroup {
  id: string;
  campusId: string;
  groupSetId: string;
  name: string; // e.g. "Group A"
  code: string; // "A"
  colour: string; // hex or semantic token
}

export interface StudentGroupMember {
  id: string;
  campusId: string;
  groupSetId: string;
  groupId: string;
  studentId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ClassEntity {
  id: string;
  campusId: string;
  courseId: string;
  batchId: string;
  termId: string;
  departmentId: string;
  classType: ClassType;
  title: string;
  defaultDurationMin: number;
  venue: string;
  leadTeacherStaffId: string;
  teacherStaffIds: string[];
  status: 'active' | 'archived';
}

export interface Section {
  id: string;
  campusId: string;
  classId: string;
  name: string; // "All", "Group A", etc.
  studentGroupId: string | null;
  capacity: number;
  isDefault: boolean;
  venue: string;
  teacherStaffIds: string[];
  status: 'active' | 'archived';
}

export interface Enrollment {
  id: string;
  campusId: string;
  classId: string;
  sectionId: string;
  studentId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: 'manual' | 'group_link' | 'rotation';
}

export interface TeachingSlotAssignment {
  groupId: string;
  classId: string;
  sectionId: string;
  staffId: string;
  venue: string;
  sessionId?: string;
}

export interface TeachingSlot {
  id: string;
  campusId: string;
  batchId: string;
  groupSetId: string;
  slotDate: string;
  startTime: string; // "09:00"
  endTime: string; // "11:00"
  rotateGroups: boolean;
  assignments: TeachingSlotAssignment[];
}

export interface ClinicalRotation {
  id: string;
  campusId: string;
  batchId: string;
  groupId: string;
  departmentId: string;
  classId: string;
  sectionId: string;
  startDate: string;
  endDate: string;
  leadSupervisorStaffId: string;
  supervisorStaffIds: string[];
}

export interface Session {
  id: string;
  campusId: string;
  classId: string;
  sectionId: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMin: number;
  sessionType: ClassType;
  clinicalSubtype?: ClinicalSubtype;
  topic: string;
  conductedByStaffId: string;
  substituteStaffId?: string | null;
  isSubstitute: boolean;
  venue: string;
  blockId: string | null;
  moduleId: string | null;
  tagOverridden: boolean;
  locationId: string | null;
  rotationId: string | null;
  enteredFromPaper: boolean;
  state: SessionState;
  cancelReason?: string;
  combinedGroupId?: string | null;
  submittedAt?: string;
  lockedAt?: string;
  version: number;
  idempotencyKey?: string;
  holidayOverrideReason?: string;
}

export interface AttendanceRecord {
  id: string;
  campusId: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  remark?: string;
  markedByUserId: string;
  markedAt: string;
}

export interface CorrectionRequestItem {
  studentId: string;
  fromStatus: AttendanceStatus;
  toStatus: AttendanceStatus;
}

export interface CorrectionRequest {
  id: string;
  campusId: string;
  sessionId: string;
  requestedByUserId: string;
  requestedByStaffId: string;
  reason: string;
  state: 'pending' | 'approved' | 'rejected';
  items: CorrectionRequestItem[];
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewComment?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  campusId: string | null;
  actorUserId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
  at: string; // UTC ISO string
}

export interface AttendanceCounts {
  held: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  medical: number;
  minutesHeld: number;
  minutesAttended: number;
  minutesExcusedOrMedical?: number;
}

export interface AttendanceResult {
  attended: number;
  denominator: number;
  pct: number | null;
  band: 'ok' | 'at_risk' | 'shortage' | 'no_sessions';
}

export interface DatabaseState {
  organizations: Organization[];
  campuses: Campus[];
  campusSettings: CampusSettings[];
  users: User[];
  roleAssignments: RoleAssignment[];
  departments: Department[];
  departmentHeads: DepartmentHeadHistory[];
  hospitalLocations: HospitalLocation[];
  programs: Program[];
  batches: Batch[];
  academicTerms: AcademicTerm[];
  calendarEvents: CalendarEvent[];
  courses: Course[];
  curriculumVersions: CurriculumVersion[];
  curriculumBlocks: CurriculumBlock[];
  curriculumModules: CurriculumModule[];
  batchCurriculumDates: BatchCurriculumDate[];
  designations: Designation[];
  staff: Staff[];
  students: Student[];
  groupSets: GroupSet[];
  studentGroups: StudentGroup[];
  studentGroupMembers: StudentGroupMember[];
  classes: ClassEntity[];
  sections: Section[];
  enrollments: Enrollment[];
  teachingSlots: TeachingSlot[];
  clinicalRotations: ClinicalRotation[];
  sessions: Session[];
  attendanceRecords: AttendanceRecord[];
  correctionRequests: CorrectionRequest[];
  auditLogs: AuditLog[];
}
