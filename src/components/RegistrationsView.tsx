import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
  Batch,
  Department,
  Designation,
  RoleAssignment,
  Staff,
  Student,
  StudentGroup,
  User,
} from '../shared/types';
import {
  can,
  formatCNIC,
  formatDatePKT,
} from '../shared/attendanceEngine';

interface RegistrationsViewProps {
  currentUser: User;
  currentUserRoles: RoleAssignment[];
  activeCampusId: string;
  students: Student[];
  staff: Staff[];
  departments: Department[];
  designations: Designation[];
  batches: Batch[];
  studentGroups: StudentGroup[];
  onRegisterStudent: (payload: Record<string, unknown>) => Promise<void>;
  onTransitionStudent: (
    studentId: string,
    payload: { targetState: string; note?: string; groupId?: string }
  ) => Promise<void>;
  onRegisterStaff: (payload: Record<string, unknown>) => Promise<void>;
}

export const RegistrationsView: React.FC<RegistrationsViewProps> = ({
  currentUser,
  currentUserRoles,
  activeCampusId,
  students,
  staff,
  departments,
  designations,
  batches,
  studentGroups,
  onRegisterStudent,
  onTransitionStudent,
  onRegisterStaff,
}) => {
  const [subTab, setSubTab] = useState<'students' | 'verification-queue' | 'staff'>('students');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [staffCatFilter, setStaffCatFilter] = useState<string>('all');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canManagePeople = can(currentUser, currentUserRoles, 'manage_students', {
    campusId: activeCampusId,
  });

  // Modals
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [activateGroupId, setActivateGroupId] = useState<string>(studentGroups[0]?.id || 'grp-a');

  // New Student Form
  const [stuName, setStuName] = useState('');
  const [stuFather, setStuFather] = useState('');
  const [stuGender, setStuGender] = useState<'Male' | 'Female'>('Female');
  const [stuDob, setStuDob] = useState('2007-04-15');
  const [stuCnic, setStuCnic] = useState('33100-5566778-2');
  const [stuMobile, setStuMobile] = useState('0300-5566778');
  const [stuCategory, setStuCategory] = useState('Open Merit');
  const [stuMdcatRoll, setStuMdcatRoll] = useState('UHS-26-91550');
  const [stuMdcatScore, setStuMdcatScore] = useState(175);
  const [stuInitialState, setStuInitialState] = useState<'draft' | 'submitted'>('submitted');

  // New Staff Form
  const [stfName, setStfName] = useState('');
  const [stfCategory, setStfCategory] = useState<'teaching' | 'clinical' | 'administrative'>('teaching');
  const [stfDeptId, setStfDeptId] = useState(departments[0]?.id || '');
  const [stfDesignationId, setStfDesignationId] = useState(designations[0]?.id || '');
  const [stfCnic, setStfCnic] = useState('33100-8877665-1');
  const [stfPmdc, setStfPmdc] = useState('64210-P');
  const [stfPmdcExpiry, setStfPmdcExpiry] = useState('2028-12-31');

  const pipelineStudents = useMemo(
    () =>
      students.filter((s) =>
        ['draft', 'submitted', 'verified', 'returned'].includes(s.registrationState)
      ),
    [students]
  );

  const filteredStudents = useMemo(() => {
    return students
      .filter((s) => (stateFilter === 'all' ? true : s.registrationState === stateFilter))
      .filter((s) => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.fatherName.toLowerCase().includes(q) ||
          (s.regNo && s.regNo.toLowerCase().includes(q)) ||
          String(s.rollNo || '').includes(q)
        );
      });
  }, [students, stateFilter, searchQuery]);

  // Sort staff by designation rank order (Spec Section 4.5)
  const sortedStaff = useMemo(() => {
    const rankMap = new Map(designations.map((d) => [d.id, d.rankOrder]));
    return staff
      .filter((s) => (staffCatFilter === 'all' ? true : s.category === staffCatFilter))
      .sort((a, b) => (rankMap.get(a.designationId) || 99) - (rankMap.get(b.designationId) || 99));
  }, [staff, designations, staffCatFilter]);

  const checkPmdcStatus = (expiryDate?: string): 'ok' | 'expiring' | 'expired' | 'none' => {
    if (!expiryDate) return 'none';
    const nowMs = Date.parse('2026-11-02T00:00:00Z');
    const expMs = Date.parse(expiryDate);
    if (Number.isNaN(expMs)) return 'ok';
    const diffDays = (expMs - nowMs) / (1000 * 3600 * 24);
    if (diffDays < 0) return 'expired';
    if (diffDays <= 60) return 'expiring';
    return 'ok';
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      await onRegisterStudent({
        name: stuName,
        fatherName: stuFather,
        gender: stuGender,
        dob: stuDob,
        cnic: stuCnic,
        mobile: stuMobile,
        admissionCategory: stuCategory,
        mdcatRollNo: stuMdcatRoll,
        mdcatScore: stuMdcatScore,
        registrationState: stuInitialState,
        batchId: batches[0]?.id,
      });
      setShowStudentModal(false);
      setStuName('');
      setStuFather('');
      setStatusMessage(`Registered student in "${stuInitialState.toUpperCase()}" state.`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      await onRegisterStaff({
        name: stfName,
        category: stfCategory,
        primaryDepartmentId: stfDeptId,
        designationId: stfDesignationId,
        cnic: stfCnic,
        pmdcNo: stfPmdc,
        pmdcExpiry: stfPmdcExpiry,
      });
      setShowStaffModal(false);
      setStfName('');
      setStatusMessage('Registered new staff member and issued campus staff code.');
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Staff registration failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Student Admissions Pipeline &amp; Faculty/Staff Register
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Only Active students appear on attendance rosters · Only Teaching &amp; Clinical staff appear in teacher pickers
          </p>
        </div>

        {canManagePeople && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowStudentModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Student</span>
            </button>
            <button
              type="button"
              onClick={() => setShowStaffModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Faculty / Staff</span>
            </button>
          </div>
        )}
      </div>

      {statusMessage && (
        <div
          role="status"
          className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-200"
        >
          {errorMessage}
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setSubTab('students')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            subTab === 'students'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          1. Student Directory ({students.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('verification-queue')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            subTab === 'verification-queue'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          2. Admissions Verification &amp; Activation Queue ({pipelineStudents.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('staff')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            subTab === 'staff'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          3. Faculty &amp; Staff Directory ({staff.length})
        </button>
      </div>

      {/* 1. STUDENT DIRECTORY */}
      {subTab === 'students' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(['all', 'active', 'submitted', 'verified', 'draft'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStateFilter(st)}
                  className={`px-3 py-1 rounded font-semibold capitalize ${
                    stateFilter === st
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                placeholder="Search student name, roll, reg..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Roll # &amp; Reg No</th>
                  <th className="py-3 px-4">Student &amp; Father Name</th>
                  <th className="py-3 px-4">CNIC &amp; Contact (PII Guarded)</th>
                  <th className="py-3 px-4">Admission &amp; Aggregate</th>
                  <th className="py-3 px-4">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredStudents.map((stu) => (
                  <tr key={stu.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono-tabular">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {stu.rollNo !== null ? `Roll #${String(stu.rollNo).padStart(2, '0')}` : 'Pending Activation'}
                      </div>
                      <div className="text-slate-500">{stu.regNo || 'No Reg Issued'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {stu.name}
                      </div>
                      <div className="text-slate-500">
                        S/D of {stu.fatherName} · {stu.gender}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-600 dark:text-slate-400">
                      <div>{stu.cnic.includes('•') ? stu.cnic : formatCNIC(stu.cnic)}</div>
                      <div>{stu.mobile} · {stu.city}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {stu.admissionCategory}
                      </div>
                      <div className="font-mono-tabular text-slate-500">
                        MDCAT: {stu.mdcatScore} · Agg: {stu.aggregatePct}%
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular uppercase font-semibold">
                      <span
                        className={
                          stu.registrationState === 'active'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        {stu.registrationState}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. ADMISSIONS VERIFICATION & ACTIVATION QUEUE */}
      {subTab === 'verification-queue' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Student Registration Pipeline (Draft → Submitted → Verified → Active)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Activating a verified student issues their unique Registration &amp; Roll Number and automatically enrols them into all &ldquo;All&rdquo; and Group-linked sections
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Teaching Group on Activation:
              </label>
              <select
                value={activateGroupId}
                onChange={(e) => setActivateGroupId(e.target.value)}
                className="px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-semibold"
              >
                {studentGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pipelineStudents.map((stu) => (
              <div
                key={stu.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-mono-tabular uppercase font-bold text-amber-700 dark:text-amber-400">
                      State: {stu.registrationState}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {stu.name}
                    </h3>
                    <div className="text-xs text-slate-500">
                      Father: {stu.fatherName} · {stu.admissionCategory}
                    </div>
                  </div>
                  <div className="text-right font-mono-tabular text-xs">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {stu.aggregatePct}%
                    </div>
                    <div className="text-slate-500">MDCAT {stu.mdcatScore}</div>
                  </div>
                </div>

                <div className="text-xs space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    Documents Checklist ({stu.documents.filter((d) => d.originalSeen).length}/{stu.documents.length} Original Seen):
                  </div>
                  {stu.documents.map((doc) => (
                    <div key={doc.docType} className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>{doc.docType}</span>
                      <span className="font-mono-tabular font-semibold">
                        {doc.originalSeen ? 'Seen ✓' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>

                {canManagePeople && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
                    {stu.registrationState === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onTransitionStudent(stu.id, { targetState: 'submitted' })}
                        className="w-full py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded"
                      >
                        Submit for Verification
                      </button>
                    )}

                    {stu.registrationState === 'submitted' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onTransitionStudent(stu.id, { targetState: 'verified' })}
                          className="flex-1 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
                        >
                          Verify Documents
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onTransitionStudent(stu.id, {
                              targetState: 'returned',
                              note: 'Original IBCC equivalence required',
                            })
                          }
                          className="px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded"
                        >
                          Return
                        </button>
                      </>
                    )}

                    {stu.registrationState === 'verified' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await onTransitionStudent(stu.id, {
                            targetState: 'active',
                            groupId: activateGroupId,
                          });
                          setStatusMessage(`Activated ${stu.name}, issued Roll No & Reg No, and enrolled in sections!`);
                          setTimeout(() => setStatusMessage(null), 4000);
                        }}
                        className="w-full py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded flex items-center justify-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Activate &amp; Issue Reg / Roll No</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. FACULTY & STAFF DIRECTORY (Sorted by Seniority Rank + PMDC Expiry Flags) */}
      {subTab === 'staff' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(['all', 'teaching', 'clinical', 'administrative'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setStaffCatFilter(cat)}
                  className={`px-3 py-1 rounded font-semibold capitalize ${
                    staffCatFilter === cat
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {cat === 'all' ? 'All Staff Categories' : `${cat} Staff`}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              Sorted by Designation Rank Order · PMDC Expiry monitored within 60 days
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Staff Code &amp; Name</th>
                  <th className="py-3 px-4">Designation &amp; Category</th>
                  <th className="py-3 px-4">Primary Department</th>
                  <th className="py-3 px-4">PMDC Registration &amp; Expiry</th>
                  <th className="py-3 px-4">Can Mark Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sortedStaff.map((st) => {
                  const des = designations.find((d) => d.id === st.designationId);
                  const dept = departments.find((d) => d.id === st.primaryDepartmentId);
                  const pmdcState = checkPmdcStatus(st.pmdcExpiry);
                  const canTeach = st.category === 'teaching' || st.category === 'clinical';

                  return (
                    <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {st.name}
                        </div>
                        <div className="font-mono-tabular text-slate-500">
                          {st.staffCode} · {st.qualifications.join(', ')}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {des?.name || 'Faculty'}
                        </div>
                        <div className="capitalize text-slate-500">
                          {st.category.replace('_', ' ')} ({st.employmentType})
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {dept?.name || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular">
                        {st.pmdcNo ? (
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              PMDC: {st.pmdcNo}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span>Exp: {formatDatePKT(st.pmdcExpiry)}</span>
                              {pmdcState === 'expired' && (
                                <span className="text-rose-700 dark:text-rose-400 font-bold inline-flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" /> EXPIRED
                                </span>
                              )}
                              {pmdcState === 'expiring' && (
                                <span className="text-amber-700 dark:text-amber-400 font-bold">
                                  · Expiring &lt;60d
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Non-clinical / N/A</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {canTeach ? (
                          <span className="text-emerald-700 dark:text-emerald-400">Yes (Eligible)</span>
                        ) : (
                          <span className="text-slate-400">No (Admin/Support)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Register Student Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Student Admission Registration Form
            </h3>
            <form onSubmit={handleStudentSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name (As on Matric Certificate) *
                  </label>
                  <input
                    type="text"
                    required
                    value={stuName}
                    onChange={(e) => setStuName(e.target.value)}
                    placeholder="e.g., Maryam Tariq"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Father&apos;s Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={stuFather}
                    onChange={(e) => setStuFather(e.target.value)}
                    placeholder="e.g., Tariq Javed"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    CNIC / B-Form (13 digits) *
                  </label>
                  <input
                    type="text"
                    required
                    value={stuCnic}
                    onChange={(e) => setStuCnic(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    required
                    value={stuDob}
                    onChange={(e) => setStuDob(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Admission Category
                  </label>
                  <select
                    value={stuCategory}
                    onChange={(e) => setStuCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="Open Merit">Open Merit</option>
                    <option value="Self-Finance">Self-Finance</option>
                    <option value="Overseas Pakistani">Overseas Pakistani</option>
                    <option value="Foreign">Foreign</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    MDCAT Roll No *
                  </label>
                  <input
                    type="text"
                    required
                    value={stuMdcatRoll}
                    onChange={(e) => setStuMdcatRoll(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    MDCAT Score (/200)
                  </label>
                  <input
                    type="number"
                    max={200}
                    value={stuMdcatScore}
                    onChange={(e) => setStuMdcatScore(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Initial Workflow State
                  </label>
                  <select
                    value={stuInitialState}
                    onChange={(e) => setStuInitialState(e.target.value as 'draft' | 'submitted')}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="submitted">Submit for Verification</option>
                    <option value="draft">Save as Incomplete Draft</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowStudentModal(false)}
                  className="px-4 py-2 font-medium border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Save Student Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Staff Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Register Faculty or Staff Member
            </h3>
            <form onSubmit={handleStaffSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={stfName}
                  onChange={(e) => setStfName(e.target.value)}
                  placeholder="e.g., Dr. Farhan Saeed"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={stfCategory}
                    onChange={(e) => setStfCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="teaching">Teaching Faculty (College)</option>
                    <option value="clinical">Clinical Faculty (Hospital)</option>
                    <option value="administrative">Administrative Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Primary Department
                  </label>
                  <select
                    value={stfDeptId}
                    onChange={(e) => setStfDeptId(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    CNIC (13 digits) *
                  </label>
                  <input
                    type="text"
                    required
                    value={stfCnic}
                    onChange={(e) => setStfCnic(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    PMDC Expiry Date
                  </label>
                  <input
                    type="date"
                    value={stfPmdcExpiry}
                    onChange={(e) => setStfPmdcExpiry(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="px-4 py-2 font-medium border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md"
                >
                  Register Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
