import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  Plus,
  UserCheck,
} from 'lucide-react';
import {
  Batch,
  BatchCurriculumDate,
  ClassEntity,
  ClinicalRotation,
  Course,
  CurriculumBlock,
  CurriculumModule,
  Department,
  DepartmentHeadHistory,
  Enrollment,
  GroupSet,
  HospitalLocation,
  RoleAssignment,
  Section,
  Staff,
  Student,
  StudentGroup,
  StudentGroupMember,
  TeachingSlot,
  User,
} from '../shared/types';
import {
  can,
  formatDatePKT,
  getCurriculumTag,
} from '../shared/attendanceEngine';

interface AcademicsAndGroupsViewProps {
  currentUser: User;
  currentUserRoles: RoleAssignment[];
  activeCampusId: string;
  departments: Department[];
  departmentHeads: DepartmentHeadHistory[];
  hospitalLocations: HospitalLocation[];
  batches: Batch[];
  courses: Course[];
  curriculumBlocks: CurriculumBlock[];
  curriculumModules: CurriculumModule[];
  batchCurriculumDates: BatchCurriculumDate[];
  classes: ClassEntity[];
  sections: Section[];
  enrollments: Enrollment[];
  groupSets: GroupSet[];
  studentGroups: StudentGroup[];
  studentGroupMembers: StudentGroupMember[];
  teachingSlots: TeachingSlot[];
  clinicalRotations: ClinicalRotation[];
  staff: Staff[];
  students: Student[];
  onAppointHod: (deptId: string, payload: { staffId: string; startDate: string; orderNo: string }) => Promise<void>;
  onCreateClass: (payload: Record<string, unknown>) => Promise<void>;
  onMoveStudentGroup: (payload: { studentId: string; targetGroupId: string; moveDate: string }) => Promise<void>;
}

type AcadTab = 'departments' | 'curriculum' | 'classes-groups' | 'slots-rotations';

export const AcademicsAndGroupsView: React.FC<AcademicsAndGroupsViewProps> = ({
  currentUser,
  currentUserRoles,
  activeCampusId,
  departments,
  departmentHeads,
  hospitalLocations,
  batches,
  courses,
  curriculumBlocks,
  curriculumModules,
  batchCurriculumDates,
  classes,
  sections,
  enrollments,
  groupSets,
  studentGroups,
  studentGroupMembers,
  teachingSlots,
  clinicalRotations,
  staff,
  students,
  onAppointHod,
  onCreateClass,
  onMoveStudentGroup,
}) => {
  const [subTab, setSubTab] = useState<AcadTab>('departments');
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const canManageClasses = can(currentUser, currentUserRoles, 'create_or_assign_classes', {
    campusId: activeCampusId,
  });
  const canSelectHod = can(currentUser, currentUserRoles, 'select_hod', {
    campusId: activeCampusId,
  });

  // HOD Appointment modal state
  const [hodModalDept, setHodModalDept] = useState<Department | null>(null);
  const [selectedHodStaffId, setSelectedHodStaffId] = useState<string>('');
  const [hodOrderNo, setHodOrderNo] = useState<string>('AMC/HR/HOD/2026-09');

  // Create Class modal state
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [newClassCourseId, setNewClassCourseId] = useState(courses[0]?.id || '');
  const [newClassBatchId, setNewClassBatchId] = useState(batches[0]?.id || '');
  const [newClassType, setNewClassType] = useState('lecture');
  const [newClassTitle, setNewClassTitle] = useState('1st Year — Medical Biochemistry — Lecture');
  const [newClassTeacherId, setNewClassTeacherId] = useState(staff[0]?.id || '');
  const [newClassVenue, setNewClassVenue] = useState('Lecture Hall 2');

  // Move Student Group state
  const activeStudents = students.filter((s) => s.registrationState === 'active');
  const [moveStudentId, setMoveStudentId] = useState(activeStudents[0]?.id || '');
  const [moveTargetGroupId, setMoveTargetGroupId] = useState(studentGroups[1]?.id || '');
  const [moveEffectiveDate, setMoveEffectiveDate] = useState('2026-11-02');

  // Curriculum Auto-Tag Tester state
  const [testDate, setTestDate] = useState('2026-11-02');
  const testedTag = getCurriculumTag(
    batches[0]?.id || 'batch-mbbs-26',
    testDate,
    curriculumBlocks,
    curriculumModules,
    batchCurriculumDates
  );

  const handleAppointHodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hodModalDept || !selectedHodStaffId) return;
    await onAppointHod(hodModalDept.id, {
      staffId: selectedHodStaffId,
      startDate: '2026-11-02',
      orderNo: hodOrderNo,
    });
    setBannerMsg(`Updated Head of Department for ${hodModalDept.name} and synced HOD role.`);
    setHodModalDept(null);
    setTimeout(() => setBannerMsg(null), 3500);
  };

  const handleCreateClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const crs = courses.find((c) => c.id === newClassCourseId);
    await onCreateClass({
      courseId: newClassCourseId,
      batchId: newClassBatchId,
      departmentId: crs?.departmentId || departments[0]?.id,
      classType: newClassType,
      title: newClassTitle,
      leadTeacherStaffId: newClassTeacherId,
      venue: newClassVenue,
      enrolWholeBatch: true,
    });
    setShowCreateClassModal(false);
    setBannerMsg(`Created class "${newClassTitle}" with default section "All" and enrolled active batch.`);
    setTimeout(() => setBannerMsg(null), 3500);
  };

  const handleMoveStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveStudentId || !moveTargetGroupId) return;
    await onMoveStudentGroup({
      studentId: moveStudentId,
      targetGroupId: moveTargetGroupId,
      moveDate: moveEffectiveDate,
    });
    setBannerMsg('Moved student group & updated linked section enrolments from effective date.');
    setTimeout(() => setBannerMsg(null), 3500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Academic Structure, UHS Curriculum, Groups &amp; Clinical Rotations
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hierarchy: Campus → Department → Program → Batch → Term → Course → Class → Section (Group-Linked)
          </p>
        </div>

        {canManageClasses && (
          <button
            type="button"
            onClick={() => setShowCreateClassModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md hover:opacity-90 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Subject Class</span>
          </button>
        )}
      </div>

      {bannerMsg && (
        <div
          role="status"
          className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{bannerMsg}</span>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        {(
          [
            { id: 'departments', label: '1. Departments, HODs & Hospital Wards' },
            { id: 'curriculum', label: '2. UHS 2K23 Blocks & Modules' },
            { id: 'classes-groups', label: '3. Classes, Sections & Student Groups' },
            { id: 'slots-rotations', label: '4. Parallel Slots & Clinical Rotations' },
          ] as Array<{ id: AcadTab; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              subTab === t.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. DEPARTMENTS, HODs & HOSPITAL TEACHING LOCATIONS */}
      {subTab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                College &amp; Hospital Teaching Departments
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Appointing a Head of Department closes the previous head&apos;s term and grants the scoped HOD role
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold">
                    <th className="py-3 px-4">Code &amp; Department</th>
                    <th className="py-3 px-4">Type &amp; Location</th>
                    <th className="py-3 px-4">Head of Department (HOD)</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {departments.map((dept) => {
                    const hod = staff.find((s) => s.id === dept.hodStaffId);
                    return (
                      <tr key={dept.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {dept.name}
                          </div>
                          <div className="font-mono-tabular text-slate-500">
                            Code: {dept.code} {dept.extension ? `· ${dept.extension}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          <span className="capitalize">{dept.deptType.replace('_', ' ')}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-semibold capitalize">{dept.location}</span>
                        </td>
                        <td className="py-3 px-4">
                          {hod ? (
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {hod.name}
                              </div>
                              <div className="text-slate-500 font-mono-tabular">
                                {hod.staffCode}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Vacant (Flagged in Setup Checklist)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canSelectHod ? (
                            <button
                              type="button"
                              onClick={() => {
                                setHodModalDept(dept);
                                setSelectedHodStaffId(dept.hodStaffId || staff[0]?.id || '');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>{hod ? 'Change Head' : 'Select Head'}</span>
                            </button>
                          ) : (
                            <span className="text-slate-400">Read-only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            {/* Hospital Teaching Locations */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                ABWA Hospital Teaching Locations (Wards, OPDs, OTs)
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {hospitalLocations.map((loc) => {
                  const dept = departments.find((d) => d.id === loc.departmentId);
                  return (
                    <div key={loc.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {loc.name}
                        </div>
                        <div className="text-slate-500">
                          {dept?.name} · {loc.floor}
                        </div>
                      </div>
                      <span className="font-mono-tabular font-semibold uppercase text-slate-600 dark:text-slate-400">
                        {loc.kind} ({loc.capacity})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Department Head History */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                HOD Appointment History (`department_heads`)
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {departmentHeads.map((dh) => {
                  const dept = departments.find((d) => d.id === dh.departmentId);
                  const st = staff.find((s) => s.id === dh.staffId);
                  return (
                    <div key={dh.id} className="py-2 space-y-0.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {dept?.name}: {st?.name}
                      </div>
                      <div className="text-slate-500 font-mono-tabular">
                        Order: {dh.orderNo} · From {formatDatePKT(dh.startDate)}{' '}
                        {dh.endDate ? `to ${formatDatePKT(dh.endDate)}` : '(Current)'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. UHS MODULAR INTEGRATED CURRICULUM 2K23 TIMELINE & AUTO-TAG TESTER */}
      {subTab === 'curriculum' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  UHS Modular Integrated Curriculum 2K23 — Blocks &amp; Modules Calendar
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Every session logged on a date is automatically tagged with the active Block and Module; spiral modules run longitudinally across blocks
                </p>
              </div>

              {/* Interactive Auto-Tag Date Tester */}
              <div className="flex items-center gap-3 p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <label htmlFor="curriculum-tag-tester" className="font-semibold text-slate-700 dark:text-slate-300 mr-2">
                    Test Auto-Tag Date:
                  </label>
                  <input
                    id="curriculum-tag-tester"
                    type="date"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono-tabular"
                  />
                </div>
                <div className="pl-2 border-l border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Resolved Tag (`getCurriculumTag`):</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-400">
                    {testedTag.block
                      ? `${testedTag.block.name} → ${testedTag.module?.name || 'Block Level'}`
                      : 'Outside scheduled module dates'}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {curriculumBlocks.map((blk) => {
                const blkMods = curriculumModules.filter((m) => m.blockId === blk.id);
                return (
                  <div
                    key={blk.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 space-y-3"
                  >
                    <div>
                      <div className="text-xs font-mono-tabular font-semibold text-slate-500">
                        YEAR {blk.yearOfStudy} · BLOCK {blk.blockNo}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {blk.name}
                      </h3>
                    </div>

                    <div className="space-y-2">
                      {blkMods.map((mod) => {
                        const cal = batchCurriculumDates.find((d) => d.moduleId === mod.id);
                        return (
                          <div
                            key={mod.id}
                            className="p-3 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 dark:text-slate-100">
                                {mod.code} — {mod.name}
                              </span>
                              <span className="font-mono-tabular text-slate-500">
                                {mod.plannedWeeks} wks {mod.isSpiral ? '· SPIRAL' : ''}
                              </span>
                            </div>
                            {cal && (
                              <div className="font-mono-tabular text-[11px] text-slate-500">
                                {formatDatePKT(cal.startDate)} → {formatDatePKT(cal.endDate)}
                                {cal.examDate ? ` · Exam: ${formatDatePKT(cal.examDate)}` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. SUBJECT CLASSES, SECTIONS & GROUP SETS */}
      {subTab === 'classes-groups' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Subject Classes & Linked Sections */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Subject Classes &amp; Section Registers
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lectures use default section &ldquo;All&rdquo;; Practicals and SGDs are linked to Student Groups A–D
              </p>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {classes.map((cls) => {
                const clsSections = sections.filter((s) => s.classId === cls.id);
                const lead = staff.find((st) => st.id === cls.leadTeacherStaffId);
                return (
                  <div key={cls.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-mono-tabular uppercase font-semibold text-slate-500">
                          {cls.classType} · {cls.defaultDurationMin} min · Venue: {cls.venue}
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {cls.title}
                        </h3>
                        <div className="text-xs text-slate-500">
                          Lead Faculty: <strong className="font-medium text-slate-700 dark:text-slate-300">{lead?.name || 'Assigned'}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {clsSections.map((sec) => {
                        const count = enrollments.filter(
                          (e) =>
                            e.sectionId === sec.id &&
                            (!e.effectiveTo || e.effectiveTo >= '2026-11-02')
                        ).length;
                        return (
                          <div
                            key={sec.id}
                            className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs flex items-center gap-2"
                          >
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {sec.name}
                            </span>
                            <span className="font-mono-tabular text-slate-500">
                              ({count} enrolled)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group Sets & Move Student Wizard */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Student Groups ({groupSets[0]?.name || 'Teaching Groups A–D'})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Every active student belongs to one group per set; linked practical sections follow group membership
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {studentGroups.map((grp) => {
                  const membersCount = studentGroupMembers.filter(
                    (m) => m.groupId === grp.id && m.effectiveTo === null
                  ).length;
                  return (
                    <div
                      key={grp.id}
                      className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 text-xs"
                    >
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {grp.name}
                      </div>
                      <div className="font-mono-tabular text-slate-500 mt-0.5">
                        Code: {grp.code} · {membersCount} active students
                      </div>
                    </div>
                  );
                })}
              </div>

              {canManageClasses && (
                <form
                  onSubmit={handleMoveStudentSubmit}
                  className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs"
                >
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Move Student Between Groups (Preserves Past Attendance)</span>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Select Student
                    </label>
                    <select
                      value={moveStudentId}
                      onChange={(e) => setMoveStudentId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                    >
                      {activeStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          Roll #{s.rollNo} — {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Target Group
                      </label>
                      <select
                        value={moveTargetGroupId}
                        onChange={(e) => setMoveTargetGroupId(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                      >
                        {studentGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Effective Move Date
                      </label>
                      <input
                        type="date"
                        value={moveEffectiveDate}
                        onChange={(e) => setMoveEffectiveDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-mono-tabular"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                  >
                    Apply Group Transfer &amp; Update Linked Sections
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. PARALLEL TEACHING SLOTS & CLINICAL ROTATIONS */}
      {subTab === 'slots-rotations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Parallel Group Teaching Slots (Clash-Checked)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Different student groups taught different subjects simultaneously (e.g. Group A Anatomy Practical, Group B Biochemistry SGD)
              </p>
            </div>

            {teachingSlots.map((slot) => (
              <div
                key={slot.id}
                className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between font-mono-tabular font-semibold">
                  <span>
                    {formatDatePKT(slot.slotDate)} · {slot.startTime} – {slot.endTime}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {slot.rotateGroups ? 'Weekly Group Rotation A→B→C' : 'Fixed Slot'}
                  </span>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {slot.assignments.map((asgn) => {
                    const grp = studentGroups.find((g) => g.id === asgn.groupId);
                    const cls = classes.find((c) => c.id === asgn.classId);
                    const teacher = staff.find((st) => st.id === asgn.staffId);
                    return (
                      <div key={asgn.groupId} className="py-2 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {grp?.name}:
                          </span>{' '}
                          <span>{cls?.title}</span>
                        </div>
                        <div className="text-slate-500">
                          {teacher?.name} · {asgn.venue}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Hospital Clinical Rotation Board (Years 3–5)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Clinical groups posted to ABWA Hospital departments with assigned clinical supervisors
              </p>
            </div>

            {clinicalRotations.map((rot) => {
              const grp = studentGroups.find((g) => g.id === rot.groupId);
              const dept = departments.find((d) => d.id === rot.departmentId);
              const sup = staff.find((s) => s.id === rot.leadSupervisorStaffId);
              return (
                <div
                  key={rot.id}
                  className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {grp?.name} → {dept?.name}
                    </span>
                    <span className="font-mono-tabular text-emerald-700 dark:text-emerald-400 font-semibold">
                      Active Posting
                    </span>
                  </div>
                  <div className="font-mono-tabular text-slate-500">
                    Posting Dates: {formatDatePKT(rot.startDate)} to {formatDatePKT(rot.endDate)}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    Lead Clinical Supervisor: <strong className="font-semibold text-slate-900 dark:text-slate-100">{sup?.name}</strong> · Clinical Threshold: 75%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appoint HOD Modal */}
      {hodModalDept && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Select Head of Department — {hodModalDept.name}
            </h3>
            <form onSubmit={handleAppointHodSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Select Faculty Member *
                </label>
                <select
                  value={selectedHodStaffId}
                  onChange={(e) => setSelectedHodStaffId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  {staff
                    .filter((s) => s.category === 'teaching' || s.category === 'clinical')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.staffCode})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Appointment Order Number
                </label>
                <input
                  type="text"
                  value={hodOrderNo}
                  onChange={(e) => setHodOrderNo(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHodModalDept(null)}
                  className="px-4 py-2 font-medium border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Appoint HOD
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Subject Class Modal */}
      {showCreateClassModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Create New Subject Class
            </h3>
            <form onSubmit={handleCreateClassSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Course / Discipline
                </label>
                <select
                  value={newClassCourseId}
                  onChange={(e) => setNewClassCourseId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Format / Class Type
                  </label>
                  <select
                    value={newClassType}
                    onChange={(e) => setNewClassType(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="lecture">Lecture</option>
                    <option value="practical">Practical / Lab</option>
                    <option value="sgd">Small Group Discussion (SGD)</option>
                    <option value="tutorial">Tutorial</option>
                    <option value="clinical">Clinical Rotation</option>
                    <option value="skills_lab">Skills Lab</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lead Teacher
                  </label>
                  <select
                    value={newClassTeacherId}
                    onChange={(e) => setNewClassTeacherId(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    {staff
                      .filter((s) => s.category === 'teaching' || s.category === 'clinical')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Class Title *
                </label>
                <input
                  type="text"
                  required
                  value={newClassTitle}
                  onChange={(e) => setNewClassTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateClassModal(false)}
                  className="px-4 py-2 font-medium border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Create Class &amp; Enrol Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
