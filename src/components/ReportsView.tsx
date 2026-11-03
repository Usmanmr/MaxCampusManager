import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  AttendanceRecord,
  Batch,
  Campus,
  CampusSettings,
  ClassEntity,
  Course,
  CurriculumBlock,
  CurriculumModule,
  Enrollment,
  Section,
  Session,
  Staff,
  Student,
} from '../shared/types';
import {
  calculateAttendance,
  formatDatePKT,
  formatTime12h,
} from '../shared/attendanceEngine';
import { AttendanceBandText, AttendanceStatusCell } from './StatusBadge';

interface ReportsViewProps {
  activeCampus: Campus;
  settings: CampusSettings;
  batches: Batch[];
  courses: Course[];
  classes: ClassEntity[];
  sections: Section[];
  students: Student[];
  staff: Staff[];
  enrollments: Enrollment[];
  sessions: Session[];
  attendanceRecords: AttendanceRecord[];
  curriculumBlocks: CurriculumBlock[];
  curriculumModules: CurriculumModule[];
}

type ReportSubTab =
  | 'section-register'
  | 'student-card'
  | 'shortage-list'
  | 'class-log';

export const ReportsView: React.FC<ReportsViewProps> = ({
  activeCampus,
  settings,
  batches,
  courses,
  classes,
  sections,
  students,
  staff,
  enrollments,
  sessions,
  attendanceRecords,
  curriculumBlocks,
  curriculumModules,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ReportSubTab>('section-register');

  // 1. Section Register filters
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    sections[0]?.id || ''
  );

  // 2. Student Card filters
  const activeStudents = useMemo(
    () =>
      students
        .filter((s) => s.registrationState === 'active')
        .sort((a, b) => (a.rollNo || 999) - (b.rollNo || 999)),
    [students]
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    activeStudents.find((s) => s.rollNo === 23)?.id || activeStudents[0]?.id || ''
  );

  // 3. Shortage List filters
  const [shortageBatchId, setShortageBatchId] = useState<string>(
    batches[0]?.id || 'all'
  );
  const [shortageLevel, setShortageLevel] = useState<'class' | 'course' | 'term'>('class');
  const [thresholdOverride, setThresholdOverride] = useState<number>(settings.thresholdPct);

  // Helper to compute AttendanceCounts for a student across a list of sessions
  const computeCountsForSessions = (studentId: string, targetSessions: Session[]) => {
    const validSess = targetSessions.filter(
      (s) => s.state === 'submitted' || s.state === 'locked'
    );
    let held = 0;
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;
    let medical = 0;
    let minutesHeld = 0;
    let minutesAttended = 0;
    let minutesExcusedOrMedical = 0;

    for (const sess of validSess) {
      const rec = attendanceRecords.find(
        (ar) => ar.sessionId === sess.id && ar.studentId === studentId
      );
      if (!rec) continue;
      held++;
      minutesHeld += sess.durationMin;
      if (rec.status === 'P') {
        present++;
        minutesAttended += sess.durationMin;
      } else if (rec.status === 'L') {
        late++;
        minutesAttended += sess.durationMin;
      } else if (rec.status === 'A') {
        absent++;
      } else if (rec.status === 'E') {
        excused++;
        minutesExcusedOrMedical += sess.durationMin;
      } else if (rec.status === 'M') {
        medical++;
        minutesExcusedOrMedical += sess.durationMin;
      }
    }

    return {
      held,
      present,
      late,
      absent,
      excused,
      medical,
      minutesHeld,
      minutesAttended,
      minutesExcusedOrMedical,
    };
  };

  // Section Register Data
  const currentSec = sections.find((s) => s.id === selectedSectionId) || sections[0];
  const currentSecClass = classes.find((c) => c.id === currentSec?.classId);
  const sectionSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.sectionId === currentSec?.id && s.state !== 'draft')
        .sort((a, b) => `${a.sessionDate}${a.startTime}`.localeCompare(`${b.sessionDate}${b.startTime}`)),
    [sessions, currentSec]
  );

  const sectionStudents = useMemo(() => {
    if (!currentSec) return [];
    const enrolledIds = new Set(
      enrollments.filter((e) => e.sectionId === currentSec.id).map((e) => e.studentId)
    );
    return activeStudents.filter((s) => enrolledIds.has(s.id));
  }, [currentSec, enrollments, activeStudents]);

  // Student Card Data (6 Levels: Class, Course, Module, Block, Clinical Rotation, Overall Term)
  const selectedStudent =
    activeStudents.find((s) => s.id === selectedStudentId) || activeStudents[0];

  const studentClassRows = useMemo(() => {
    if (!selectedStudent) return [];
    const stuClassIds = Array.from(
      new Set(
        enrollments
          .filter((e) => e.studentId === selectedStudent.id)
          .map((e) => e.classId)
      )
    );
    return stuClassIds
      .map((cid) => {
        const cls = classes.find((c) => c.id === cid);
        if (!cls) return null;
        const clsSessions = sessions.filter((s) => s.classId === cls.id);
        const counts = computeCountsForSessions(selectedStudent.id, clsSessions);
        const result = calculateAttendance(
          counts,
          settings,
          cls.classType === 'clinical' ? settings.clinicalThresholdPct : undefined
        );
        return { cls, counts, result };
      })
      .filter(Boolean) as Array<{
      cls: ClassEntity;
      counts: ReturnType<typeof computeCountsForSessions>;
      result: ReturnType<typeof calculateAttendance>;
    }>;
  }, [selectedStudent, enrollments, classes, sessions, attendanceRecords, settings]);

  const studentCourseRows = useMemo(() => {
    if (!selectedStudent) return [];
    return courses
      .map((crs) => {
        const crsClassIds = new Set(
          classes.filter((c) => c.courseId === crs.id).map((c) => c.id)
        );
        const crsSessions = sessions.filter((s) => crsClassIds.has(s.classId));
        const counts = computeCountsForSessions(selectedStudent.id, crsSessions);
        if (counts.held === 0) return null;
        const result = calculateAttendance(counts, settings);
        return { course: crs, counts, result };
      })
      .filter(Boolean) as Array<{
      course: Course;
      counts: ReturnType<typeof computeCountsForSessions>;
      result: ReturnType<typeof calculateAttendance>;
    }>;
  }, [selectedStudent, courses, classes, sessions, attendanceRecords, settings]);

  const studentModuleRows = useMemo(() => {
    if (!selectedStudent) return [];
    return curriculumModules
      .map((mod) => {
        const modSessions = sessions.filter((s) => s.moduleId === mod.id);
        const counts = computeCountsForSessions(selectedStudent.id, modSessions);
        if (counts.held === 0) return null;
        const blk = curriculumBlocks.find((b) => b.id === mod.blockId);
        const result = calculateAttendance(counts, settings);
        return { module: mod, block: blk, counts, result };
      })
      .filter(Boolean) as Array<{
      module: CurriculumModule;
      block?: CurriculumBlock;
      counts: ReturnType<typeof computeCountsForSessions>;
      result: ReturnType<typeof calculateAttendance>;
    }>;
  }, [selectedStudent, curriculumModules, curriculumBlocks, sessions, attendanceRecords, settings]);

  // Shortage & At-Risk List Computation
  const shortageRows = useMemo(() => {
    const filteredStudents =
      shortageBatchId === 'all'
        ? activeStudents
        : activeStudents.filter((s) => s.batchId === shortageBatchId);

    const rows: Array<{
      student: Student;
      scopeLabel: string;
      counts: ReturnType<typeof computeCountsForSessions>;
      result: ReturnType<typeof calculateAttendance>;
    }> = [];

    for (const stu of filteredStudents) {
      if (shortageLevel === 'class') {
        const stuClassIds = Array.from(
          new Set(enrollments.filter((e) => e.studentId === stu.id).map((e) => e.classId))
        );
        for (const cid of stuClassIds) {
          const cls = classes.find((c) => c.id === cid);
          if (!cls) continue;
          const counts = computeCountsForSessions(
            stu.id,
            sessions.filter((s) => s.classId === cid)
          );
          if (counts.held === 0) continue;
          const result = calculateAttendance(counts, settings, thresholdOverride);
          if (result.band === 'shortage' || result.band === 'at_risk') {
            rows.push({ student: stu, scopeLabel: cls.title, counts, result });
          }
        }
      } else if (shortageLevel === 'course') {
        for (const crs of courses) {
          const cIds = new Set(classes.filter((c) => c.courseId === crs.id).map((c) => c.id));
          const counts = computeCountsForSessions(
            stu.id,
            sessions.filter((s) => cIds.has(s.classId))
          );
          if (counts.held === 0) continue;
          const result = calculateAttendance(counts, settings, thresholdOverride);
          if (result.band === 'shortage' || result.band === 'at_risk') {
            rows.push({ student: stu, scopeLabel: `${crs.code} — ${crs.title}`, counts, result });
          }
        }
      } else {
        const counts = computeCountsForSessions(stu.id, sessions);
        if (counts.held === 0) continue;
        const result = calculateAttendance(counts, settings, thresholdOverride);
        if (result.band === 'shortage' || result.band === 'at_risk') {
          rows.push({ student: stu, scopeLabel: 'Overall Academic Term', counts, result });
        }
      }
    }

    return rows.sort((a, b) => (a.result.pct ?? 100) - (b.result.pct ?? 100));
  }, [
    activeStudents,
    shortageBatchId,
    shortageLevel,
    thresholdOverride,
    enrollments,
    classes,
    courses,
    sessions,
    attendanceRecords,
    settings,
  ]);

  // CSV Export Handler
  const handleDownloadCSV = () => {
    let csvLines: string[] = [];
    if (activeSubTab === 'section-register' && currentSec) {
      const headers = [
        'Roll No',
        'Reg No',
        'Student Name',
        ...sectionSessions.map((s) => `${s.sessionDate} (${s.startTime})`),
        'Held',
        'Attended',
        'Percentage',
        'Band',
      ];
      csvLines.push(headers.join(','));
      for (const stu of sectionStudents) {
        const counts = computeCountsForSessions(stu.id, sectionSessions);
        const calc = calculateAttendance(counts, settings);
        const marks = sectionSessions.map((sess) => {
          const rec = attendanceRecords.find(
            (ar) => ar.sessionId === sess.id && ar.studentId === stu.id
          );
          return rec?.status || '—';
        });
        csvLines.push(
          [
            stu.rollNo,
            stu.regNo,
            `"${stu.name}"`,
            ...marks,
            calc.denominator,
            calc.attended,
            calc.pct !== null ? `${calc.pct}%` : '—',
            calc.band.toUpperCase(),
          ].join(',')
        );
      }
    } else {
      csvLines.push('Roll No,Reg No,Student Name,Scope,Held,Attended,Percentage,Band');
      for (const r of shortageRows) {
        csvLines.push(
          [
            r.student.rollNo,
            r.student.regNo,
            `"${r.student.name}"`,
            `"${r.scopeLabel}"`,
            r.result.denominator,
            r.result.attended,
            `${r.result.pct}%`,
            r.result.band.toUpperCase(),
          ].join(',')
        );
      }
    }

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ABWA_${activeCampus.code}_${activeSubTab}_2026-11-02.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Attendance Reports, Registers &amp; Shortage Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All percentages computed via the shared server calculation engine · Basis: {settings.calcBasis === 'hours' ? 'Contact Hours' : 'Session Count'} · Threshold: {settings.thresholdPct}%
          </p>
        </div>

        <div className="no-print flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV / Excel</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md hover:opacity-90"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print A4 Register</span>
          </button>
        </div>
      </div>

      {/* Sub-Tab Selector */}
      <div className="no-print flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        {(
          [
            { id: 'section-register', label: '1. Section Register (Matrix)' },
            { id: 'student-card', label: '2. Student Attendance Card (6 Levels)' },
            { id: 'shortage-list', label: `3. Shortage & At-Risk List (${shortageRows.length})` },
            { id: 'class-log', label: '4. Class Log & Teaching Record' },
          ] as Array<{ id: ReportSubTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. SECTION REGISTER (Monthly Students x Sessions Matrix) */}
      {activeSubTab === 'section-register' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                {activeCampus.name} · Official Section Register
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {currentSecClass?.title} — Section {currentSec?.name}
              </h2>
            </div>

            <div className="no-print flex items-center gap-2">
              <label htmlFor="reg-sec-select" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Switch Section:
              </label>
              <select
                id="reg-sec-select"
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                {sections.map((s) => {
                  const cls = classes.find((c) => c.id === s.classId);
                  return (
                    <option key={s.id} value={s.id}>
                      {cls?.title} — {s.name}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950">
                  <th className="py-3 px-4 sticky left-0 bg-slate-50 dark:bg-slate-950 z-10 min-w-[220px]">
                    Roll # &amp; Student Name
                  </th>
                  {sectionSessions.map((sess) => (
                    <th
                      key={sess.id}
                      className="py-2.5 px-3 text-center font-mono-tabular whitespace-nowrap border-l border-slate-200 dark:border-slate-800"
                      title={sess.topic}
                    >
                      <div>{formatDatePKT(sess.sessionDate).slice(0, 6)}</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        {sess.startTime}
                      </div>
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right border-l border-slate-200 dark:border-slate-800">
                    Attended / Held
                  </th>
                  <th className="py-3 px-4 text-right">
                    Attendance % &amp; Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {sectionStudents.map((stu) => {
                  const counts = computeCountsForSessions(stu.id, sectionSessions);
                  const calc = calculateAttendance(counts, settings);

                  return (
                    <tr
                      key={stu.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 sticky left-0 bg-white dark:bg-slate-900 z-10">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono-tabular text-xs font-bold text-slate-500 w-7">
                            #{String(stu.rollNo || 0).padStart(2, '0')}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                              {stu.name}
                            </div>
                            <div className="text-[11px] font-mono-tabular text-slate-500">
                              {stu.regNo}
                            </div>
                          </div>
                        </div>
                      </td>

                      {sectionSessions.map((sess) => {
                        const rec = attendanceRecords.find(
                          (ar) => ar.sessionId === sess.id && ar.studentId === stu.id
                        );
                        return (
                          <td
                            key={sess.id}
                            className="py-2 px-2 text-center border-l border-slate-100 dark:border-slate-800/60"
                          >
                            {sess.state === 'cancelled' ? (
                              <span className="text-[10px] text-slate-400 line-through">CANC</span>
                            ) : rec ? (
                              <AttendanceStatusCell status={rec.status} size="sm" />
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="py-2.5 px-3 text-right font-mono-tabular text-xs font-semibold text-slate-800 dark:text-slate-200 border-l border-slate-200 dark:border-slate-800">
                        {calc.attended} / {calc.denominator}
                        {settings.calcBasis === 'hours' ? ' h' : ''}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <AttendanceBandText band={calc.band} pct={calc.pct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. STUDENT ATTENDANCE CARD (All 6 Levels + Section 5.7 Worked Example Verification) */}
      {activeSubTab === 'student-card' && selectedStudent && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  Roll #{selectedStudent.rollNo} · {selectedStudent.regNo} · UHS Reg: {selectedStudent.uhsRegNo || 'Pending'}
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {selectedStudent.name} — Multi-Level Attendance Card
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Father: {selectedStudent.fatherName} · Admission: {selectedStudent.admissionCategory}
                </p>
              </div>

              <div className="no-print flex items-center gap-2">
                <label htmlFor="student-card-picker" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Select Student:
                </label>
                <select
                  id="student-card-picker"
                  value={selectedStudent.id}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  {activeStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      Roll #{s.rollNo} — {s.name} ({s.regNo})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Level 1: Per Subject Class Breakdown */}
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Level 1: Attendance per Subject Class (Lecture / Practical / SGD / Clinical)
              </h3>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2.5 px-4">Class Title &amp; Format</th>
                      <th className="py-2.5 px-3 text-right">P</th>
                      <th className="py-2.5 px-3 text-right">L</th>
                      <th className="py-2.5 px-3 text-right">A</th>
                      <th className="py-2.5 px-3 text-right">E / M</th>
                      <th className="py-2.5 px-3 text-right">Attended / Denominator</th>
                      <th className="py-2.5 px-4 text-right">Percentage &amp; Band</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {studentClassRows.map(({ cls, counts, result }) => (
                      <tr key={cls.id}>
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          {cls.title}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-emerald-700 dark:text-emerald-400 font-semibold">
                          {counts.present}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-amber-700 dark:text-amber-400">
                          {counts.late}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-rose-700 dark:text-rose-400 font-semibold">
                          {counts.absent}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                          {counts.excused + counts.medical}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-semibold">
                          {result.attended} / {result.denominator}
                          {settings.calcBasis === 'hours' ? ' h' : ''}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <AttendanceBandText band={result.band} pct={result.pct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Level 2 & Level 3/4: Per Course (Combined Discipline) & Per UHS Block/Module */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
                  Level 2: Combined per Course / Discipline
                </h3>
                <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 px-3">Course / Discipline</th>
                        <th className="py-2 px-3 text-right">Attended / Held</th>
                        <th className="py-2 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {studentCourseRows.map(({ course, result }) => (
                        <tr key={course.id}>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                            {course.code} — {course.title}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {result.attended} / {result.denominator}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <AttendanceBandText band={result.band} pct={result.pct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
                  Level 3 &amp; 4: UHS Curriculum Block &amp; Module Tags
                </h3>
                <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 px-3">UHS Block &amp; Module</th>
                        <th className="py-2 px-3 text-right">Attended / Held</th>
                        <th className="py-2 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {studentModuleRows.map(({ module, block, result }) => (
                        <tr key={module.id}>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                            Block {block?.blockNo || 1}: {module.name}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {result.attended} / {result.denominator}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <AttendanceBandText band={result.band} pct={result.pct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. SHORTAGE & AT-RISK LIST */}
      {activeSubTab === 'shortage-list' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Shortage (&lt;{thresholdOverride}%) &amp; At-Risk Warning Band List
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sorted by attendance percentage ascending · Used for UHS professional exam eligibility verification
              </p>
            </div>

            <div className="no-print flex flex-wrap items-center gap-3 text-xs">
              <div>
                <label className="mr-1.5 font-medium text-slate-600 dark:text-slate-400">Batch:</label>
                <select
                  value={shortageBatchId}
                  onChange={(e) => setShortageBatchId(e.target.value)}
                  className="px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-semibold"
                >
                  <option value="all">All Batches</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.yearClassLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mr-1.5 font-medium text-slate-600 dark:text-slate-400">Aggregation Level:</label>
                <select
                  value={shortageLevel}
                  onChange={(e) => setShortageLevel(e.target.value as 'class' | 'course' | 'term')}
                  className="px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-semibold"
                >
                  <option value="class">Per Subject Class</option>
                  <option value="course">Per Course / Discipline</option>
                  <option value="term">Overall Academic Term</option>
                </select>
              </div>

              <div>
                <label className="mr-1.5 font-medium text-slate-600 dark:text-slate-400">Threshold %:</label>
                <input
                  type="number"
                  min={50}
                  max={95}
                  value={thresholdOverride}
                  onChange={(e) => setThresholdOverride(Number(e.target.value))}
                  className="w-16 px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono-tabular font-semibold"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-950">
                  <th className="py-3 px-4">Roll #</th>
                  <th className="py-3 px-4">Student Name &amp; Reg No</th>
                  <th className="py-3 px-4">Class / Course Scope</th>
                  <th className="py-3 px-4 text-right">Attended / Held</th>
                  <th className="py-3 px-4 text-right">Absences</th>
                  <th className="py-3 px-4 text-right">Attendance % &amp; Band</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {shortageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      All students meet the {thresholdOverride}% attendance threshold for this filter.
                    </td>
                  </tr>
                ) : (
                  shortageRows.map((row, idx) => (
                    <tr key={`${row.student.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono-tabular font-bold text-xs">
                        #{String(row.student.rollNo || 0).padStart(2, '0')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                          {row.student.name}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-slate-500">
                          {row.student.regNo}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                        {row.scopeLabel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-xs font-semibold">
                        {row.result.attended} / {row.result.denominator}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-xs text-rose-700 dark:text-rose-400 font-semibold">
                        {row.counts.absent}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <AttendanceBandText band={row.result.band} pct={row.result.pct} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. CLASS LOG & TEACHING RECORD */}
      {activeSubTab === 'class-log' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Class Log &amp; Faculty Teaching Record
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Complete log of sessions conducted, curriculum topics covered, UHS Block/Module tags, and register state
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-950">
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Class &amp; Section</th>
                  <th className="py-3 px-4">Topic Covered</th>
                  <th className="py-3 px-4">Conducted By</th>
                  <th className="py-3 px-4">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {sessions.map((sess) => {
                  const cls = classes.find((c) => c.id === sess.classId);
                  const sec = sections.find((s) => s.id === sess.sectionId);
                  const teacher = staff.find((st) => st.id === sess.conductedByStaffId);
                  return (
                    <tr key={sess.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono-tabular whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {formatDatePKT(sess.sessionDate)}
                        </div>
                        <div className="text-slate-500">
                          {formatTime12h(sess.startTime)} – {formatTime12h(sess.endTime)} ({sess.durationMin}m)
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {cls?.title}
                        </div>
                        <div className="text-slate-500">Section: {sec?.name} · {sess.venue}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200 max-w-xs">
                        {sess.topic}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {teacher?.name || 'Faculty'}
                        {sess.isSubstitute && <span className="ml-1 text-amber-600">(Substitute)</span>}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular uppercase font-semibold">
                        {sess.state}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
