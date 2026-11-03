/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  HeaderAndSidebar,
  NavTabId,
} from './components/HeaderAndSidebar';
import { DashboardView } from './components/DashboardView';
import { TakeAttendanceView } from './components/TakeAttendanceView';
import { ReportsView } from './components/ReportsView';
import { AcademicsAndGroupsView } from './components/AcademicsAndGroupsView';
import { RegistrationsView } from './components/RegistrationsView';
import { AdminAndGovernanceView } from './components/AdminAndGovernanceView';
import { createInitialDatabaseState } from './shared/seedData';
import {
  AttendanceStatus,
  CampusSettings,
  Session,
} from './shared/types';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('abwa_dark_mode') === 'true';
    } catch {
      return false;
    }
  });

  const [selectedUserId, setSelectedUserId] = useState<string>('user-super');
  const [selectedCampusId, setSelectedCampusId] = useState<string>('campus-amc');
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [appState, setAppState] = useState<any>(() => {
    // Hydrate immediately with deterministic seed state so first paint is instant
    const seed = createInitialDatabaseState();
    return {
      currentUser: seed.users[0],
      currentUserRoles: seed.roleAssignments.filter((r) => r.userId === seed.users[0].id),
      currentUserStaff: null,
      activeCampusId: 'campus-amc',
      organizations: seed.organizations,
      campuses: seed.campuses,
      campusSettings: seed.campusSettings[0],
      allUsers: seed.users,
      allRoleAssignments: seed.roleAssignments,
      departments: seed.departments.filter((d) => d.campusId === 'campus-amc'),
      departmentHeads: seed.departmentHeads.filter((dh) => dh.campusId === 'campus-amc'),
      hospitalLocations: seed.hospitalLocations.filter((h) => h.campusId === 'campus-amc'),
      programs: seed.programs.filter((p) => p.campusId === 'campus-amc'),
      batches: seed.batches.filter((b) => b.campusId === 'campus-amc'),
      academicTerms: seed.academicTerms.filter((t) => t.campusId === 'campus-amc'),
      calendarEvents: seed.calendarEvents.filter((e) => e.campusId === 'campus-amc'),
      courses: seed.courses.filter((c) => c.campusId === 'campus-amc'),
      curriculumVersions: seed.curriculumVersions.filter((v) => v.campusId === 'campus-amc'),
      curriculumBlocks: seed.curriculumBlocks.filter((b) => b.campusId === 'campus-amc'),
      curriculumModules: seed.curriculumModules.filter((m) => m.campusId === 'campus-amc'),
      batchCurriculumDates: seed.batchCurriculumDates.filter((bcd) => bcd.campusId === 'campus-amc'),
      designations: seed.designations.filter((d) => d.campusId === 'campus-amc'),
      staff: seed.staff.filter((s) => s.campusId === 'campus-amc'),
      students: seed.students.filter((s) => s.campusId === 'campus-amc'),
      groupSets: seed.groupSets.filter((gs) => gs.campusId === 'campus-amc'),
      studentGroups: seed.studentGroups.filter((sg) => sg.campusId === 'campus-amc'),
      studentGroupMembers: seed.studentGroupMembers.filter((sgm) => sgm.campusId === 'campus-amc'),
      classes: seed.classes.filter((c) => c.campusId === 'campus-amc'),
      sections: seed.sections.filter((s) => s.campusId === 'campus-amc'),
      enrollments: seed.enrollments.filter((e) => e.campusId === 'campus-amc'),
      teachingSlots: seed.teachingSlots.filter((ts) => ts.campusId === 'campus-amc'),
      clinicalRotations: seed.clinicalRotations.filter((cr) => cr.campusId === 'campus-amc'),
      sessions: seed.sessions.filter((s) => s.campusId === 'campus-amc'),
      attendanceRecords: seed.attendanceRecords.filter((ar) => ar.campusId === 'campus-amc'),
      correctionRequests: seed.correctionRequests.filter((cr) => cr.campusId === 'campus-amc'),
      auditLogs: seed.auditLogs,
      villageSummaries: [],
    };
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('abwa_dark_mode', String(darkMode));
    } catch {}
  }, [darkMode]);

  const fetchState = useCallback(
    async (userId = selectedUserId, campusId = selectedCampusId) => {
      try {
        const res = await fetch('/api/v1/state', {
          headers: {
            'X-User-Id': userId,
            'X-Campus-Id': campusId,
          },
        });
        const json = await res.json();
        if (res.ok && json.data) {
          setAppState(json.data);
          if (json.data.activeCampusId !== campusId) {
            setSelectedCampusId(json.data.activeCampusId);
          }
        }
      } catch (err) {
        console.error('Failed to sync state from /api/v1/state:', err);
      }
    },
    [selectedUserId, selectedCampusId]
  );

  useEffect(() => {
    fetchState(selectedUserId, selectedCampusId);
  }, [selectedUserId, selectedCampusId, fetchState]);

  const apiCall = async (path: string, method: string, body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': selectedUserId,
        'X-Campus-Id': selectedCampusId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error?.message || 'Request failed');
    }
    await fetchState(selectedUserId, selectedCampusId);
    return json.data;
  };

  const activeCampus =
    appState.campuses.find((c: any) => c.id === appState.activeCampusId) ||
    appState.campuses[0];

  const pendingCorrectionsCount = appState.correctionRequests.filter(
    (c: any) => c.state === 'pending'
  ).length;

  const pendingVerificationsCount = appState.students.filter((s: any) =>
    ['draft', 'submitted', 'verified'].includes(s.registrationState)
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <HeaderAndSidebar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        campuses={appState.campuses}
        activeCampusId={appState.activeCampusId}
        onSelectCampus={(cid) => setSelectedCampusId(cid)}
        currentUser={appState.currentUser}
        currentUserRoles={appState.currentUserRoles}
        allUsers={appState.allUsers}
        onSelectUser={(uid) => setSelectedUserId(uid)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        pendingCorrectionsCount={pendingCorrectionsCount}
        pendingVerificationsCount={pendingVerificationsCount}
      />

      <main className="md:pl-64 pb-20 md:pb-12">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              currentUser={appState.currentUser}
              currentUserRoles={appState.currentUserRoles}
              activeCampus={activeCampus}
              settings={appState.campusSettings}
              departments={appState.departments}
              batches={appState.batches}
              classes={appState.classes}
              sections={appState.sections}
              students={appState.students}
              staff={appState.staff}
              enrollments={appState.enrollments}
              sessions={appState.sessions}
              attendanceRecords={appState.attendanceRecords}
              correctionRequests={appState.correctionRequests}
              villageSummaries={appState.villageSummaries}
              onSelectCampus={(cid) => setSelectedCampusId(cid)}
              onSelectTab={(tab) => setActiveTab(tab)}
              onStartAttendanceForSection={(secId) => {
                setTargetSectionId(secId);
                setActiveTab('take-attendance');
              }}
              onCreateCampus={async (payload) => {
                await apiCall('/api/v1/campuses', 'POST', payload);
              }}
            />
          )}

          {activeTab === 'take-attendance' && (
            <TakeAttendanceView
              currentUser={appState.currentUser}
              currentUserRoles={appState.currentUserRoles}
              currentUserStaff={appState.currentUserStaff}
              settings={appState.campusSettings}
              classes={appState.classes}
              sections={appState.sections}
              students={appState.students}
              staff={appState.staff}
              enrollments={appState.enrollments}
              sessions={appState.sessions}
              attendanceRecords={appState.attendanceRecords}
              curriculumBlocks={appState.curriculumBlocks}
              curriculumModules={appState.curriculumModules}
              batchCurriculumDates={appState.batchCurriculumDates}
              hospitalLocations={appState.hospitalLocations}
              initialSectionId={targetSectionId}
              onCreateSession={async (payload): Promise<Session> => {
                return await apiCall('/api/v1/sessions', 'POST', payload);
              }}
              onSaveRecords={async (sessionId, payload) => {
                await apiCall(`/api/v1/sessions/${sessionId}/records`, 'PUT', payload);
              }}
              onSubmitSession={async (sessionId, payload) => {
                await apiCall(`/api/v1/sessions/${sessionId}/submit`, 'POST', payload);
              }}
              onAdminEditLocked={async (sessionId, payload) => {
                await apiCall(`/api/v1/sessions/${sessionId}/admin-edit`, 'POST', payload);
              }}
              onCancelSession={async (sessionId, reason) => {
                await apiCall(`/api/v1/sessions/${sessionId}/cancel`, 'POST', { reason });
              }}
              onRaiseCorrection={async (payload) => {
                await apiCall('/api/v1/corrections', 'POST', payload);
              }}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              activeCampus={activeCampus}
              settings={appState.campusSettings}
              batches={appState.batches}
              courses={appState.courses}
              classes={appState.classes}
              sections={appState.sections}
              students={appState.students}
              staff={appState.staff}
              enrollments={appState.enrollments}
              sessions={appState.sessions}
              attendanceRecords={appState.attendanceRecords}
              curriculumBlocks={appState.curriculumBlocks}
              curriculumModules={appState.curriculumModules}
            />
          )}

          {activeTab === 'academics' && (
            <AcademicsAndGroupsView
              currentUser={appState.currentUser}
              currentUserRoles={appState.currentUserRoles}
              activeCampusId={appState.activeCampusId}
              departments={appState.departments}
              departmentHeads={appState.departmentHeads}
              hospitalLocations={appState.hospitalLocations}
              batches={appState.batches}
              courses={appState.courses}
              curriculumBlocks={appState.curriculumBlocks}
              curriculumModules={appState.curriculumModules}
              batchCurriculumDates={appState.batchCurriculumDates}
              classes={appState.classes}
              sections={appState.sections}
              enrollments={appState.enrollments}
              groupSets={appState.groupSets}
              studentGroups={appState.studentGroups}
              studentGroupMembers={appState.studentGroupMembers}
              teachingSlots={appState.teachingSlots}
              clinicalRotations={appState.clinicalRotations}
              staff={appState.staff}
              students={appState.students}
              onAppointHod={async (deptId, payload) => {
                await apiCall(`/api/v1/departments/${deptId}/hod`, 'POST', payload);
              }}
              onCreateClass={async (payload) => {
                await apiCall('/api/v1/classes', 'POST', payload);
              }}
              onMoveStudentGroup={async (payload) => {
                await apiCall('/api/v1/groups/move-student', 'POST', payload);
              }}
            />
          )}

          {activeTab === 'people' && (
            <RegistrationsView
              currentUser={appState.currentUser}
              currentUserRoles={appState.currentUserRoles}
              activeCampusId={appState.activeCampusId}
              students={appState.students}
              staff={appState.staff}
              departments={appState.departments}
              designations={appState.designations}
              batches={appState.batches}
              studentGroups={appState.studentGroups}
              onRegisterStudent={async (payload) => {
                await apiCall('/api/v1/students', 'POST', payload);
              }}
              onTransitionStudent={async (studentId, payload) => {
                await apiCall(`/api/v1/students/${studentId}/transition`, 'POST', payload);
              }}
              onRegisterStaff={async (payload) => {
                await apiCall('/api/v1/staff', 'POST', payload);
              }}
            />
          )}

          {activeTab === 'governance' && (
            <AdminAndGovernanceView
              currentUser={appState.currentUser}
              currentUserRoles={appState.currentUserRoles}
              activeCampus={activeCampus}
              settings={appState.campusSettings}
              correctionRequests={appState.correctionRequests}
              sessions={appState.sessions}
              classes={appState.classes}
              sections={appState.sections}
              students={appState.students}
              staff={appState.staff}
              auditLogs={appState.auditLogs}
              fullStateForBackup={appState}
              onReviewCorrection={async (requestId, payload) => {
                await apiCall(`/api/v1/corrections/${requestId}/review`, 'POST', payload);
              }}
              onUpdateSettings={async (campusId, payload: Partial<CampusSettings>) => {
                await apiCall(`/api/v1/campuses/${campusId}/settings`, 'PATCH', payload);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
