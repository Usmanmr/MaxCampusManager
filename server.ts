import express, { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createInitialDatabaseState } from './src/shared/seedData.ts';
import {
  calculateAttendance,
  can,
  detectSessionClash,
  getCurriculumTag,
  getSessionLockStatus,
  isValidCNIC,
} from './src/shared/attendanceEngine.ts';
import {
  AttendanceStatus,
  DatabaseState,
  Enrollment,
  Section,
  Student,
} from './src/shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'abwa_cms_db.json');

function loadDb(): DatabaseState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseState;
      if (parsed && Array.isArray(parsed.campuses) && parsed.campuses.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading persisted database, re-seeding:', err);
  }
  const initial = createInitialDatabaseState();
  saveDb(initial);
  return initial;
}

function saveDb(state: DatabaseState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist database:', err);
  }
}

let db: DatabaseState = loadDb();
const idempotencyCache = new Map<string, unknown>();

function getActor(req: Request) {
  const userId = (req.headers['x-user-id'] as string) || 'user-super';
  const user = db.users.find((u) => u.id === userId) || db.users[0];
  const roles = db.roleAssignments.filter((r) => r.userId === user.id);
  const staffRecord = db.staff.find((s) => s.userId === user.id) || null;
  return { user, roles, staffRecord };
}

function appendAudit(
  campusId: string | null,
  actorUserId: string,
  actorName: string,
  action: string,
  entityType: string,
  entityId: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
  reason?: string
) {
  db.auditLogs.unshift({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    campusId,
    actorUserId,
    actorName,
    action,
    entityType,
    entityId,
    before: before ?? null,
    after: after ?? null,
    reason,
    at: new Date().toISOString(),
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // GET /api/v1/state — Scoped multi-campus state & Village Overview
  app.get('/api/v1/state', (req: Request, res: Response) => {
    const { user, roles, staffRecord } = getActor(req);
    if (!user.isActive) {
      return res.status(403).json({
        error: { code: 'USER_DISABLED', message: 'Your account has been disabled. Contact your administrator.' },
      });
    }

    const isSuperAdmin = roles.some((r) => r.role === 'SUPER_ADMIN');
    const accessibleCampusIds = isSuperAdmin
      ? db.campuses.map((c) => c.id)
      : Array.from(new Set(roles.map((r) => r.campusId).filter(Boolean) as string[]));

    const requestedCampusId = (req.headers['x-campus-id'] as string) || accessibleCampusIds[0] || 'campus-amc';
    if (!isSuperAdmin && !accessibleCampusIds.includes(requestedCampusId)) {
      return res.status(403).json({
        error: {
          code: 'CAMPUS_ISOLATION_DENIED',
          message: `Access denied: you do not hold a role in campus ${requestedCampusId}.`,
        },
      });
    }

    const activeCampusId = accessibleCampusIds.includes(requestedCampusId)
      ? requestedCampusId
      : accessibleCampusIds[0] || 'campus-amc';

    const canSeePii = can(user, roles, 'view_sensitive_pii', { campusId: activeCampusId });

    // Strictly filter every campus-owned entity by activeCampusId (Layer 1 Campus Isolation)
    const campusStudents = db.students
      .filter((s) => s.campusId === activeCampusId)
      .map((s) =>
        canSeePii
          ? s
          : {
              ...s,
              cnic: '•••••-•••••••-•',
              mobile: '••••-•••••••',
              guardianMobile: '••••-•••••••',
              permanentAddress: 'Restricted (Admin Only)',
            }
      );

    const campusStaff = db.staff
      .filter((s) => s.campusId === activeCampusId)
      .map((s) =>
        canSeePii
          ? s
          : {
              ...s,
              cnic: '•••••-•••••••-•',
              mobile: '••••-•••••••',
            }
      );

    // Village-wide summary for Super Admin
    const villageSummaries = isSuperAdmin
      ? db.campuses.map((c) => {
          const cSessions = db.sessions.filter(
            (s) => s.campusId === c.id && (s.state === 'submitted' || s.state === 'locked')
          );
          const cRecords = db.attendanceRecords.filter((r) =>
            cSessions.some((s) => s.id === r.sessionId)
          );
          const presentOrLate = cRecords.filter((r) => r.status === 'P' || r.status === 'L').length;
          const todayPct =
            cRecords.length > 0 ? Math.round((presentOrLate / cRecords.length) * 1000) / 10 : null;
          const activeStudents = db.students.filter(
            (st) => st.campusId === c.id && st.registrationState === 'active'
          ).length;
          const activeStaff = db.staff.filter((st) => st.campusId === c.id && st.status === 'active').length;
          const totalSections = db.sections.filter((sec) => sec.campusId === c.id && sec.status === 'active').length;
          const markedToday = db.sessions.filter(
            (s) => s.campusId === c.id && s.sessionDate === '2026-11-02' && s.state !== 'cancelled'
          ).length;
          return {
            campus: c,
            settings: db.campusSettings.find((cs) => cs.campusId === c.id),
            activeStudents,
            activeStaff,
            sessionsHeld: cSessions.length,
            attendancePct: todayPct,
            unmarkedSectionsToday: Math.max(0, totalSections - markedToday),
          };
        })
      : [];

    return res.json({
      data: {
        currentUser: user,
        currentUserRoles: roles,
        currentUserStaff: staffRecord,
        activeCampusId,
        organizations: db.organizations,
        campuses: isSuperAdmin
          ? db.campuses
          : db.campuses.filter((c) => accessibleCampusIds.includes(c.id)),
        campusSettings: db.campusSettings.find((cs) => cs.campusId === activeCampusId) || db.campusSettings[0],
        allUsers: db.users,
        allRoleAssignments: db.roleAssignments,
        departments: db.departments.filter((d) => d.campusId === activeCampusId),
        departmentHeads: db.departmentHeads.filter((dh) => dh.campusId === activeCampusId),
        hospitalLocations: db.hospitalLocations.filter((h) => h.campusId === activeCampusId),
        programs: db.programs.filter((p) => p.campusId === activeCampusId),
        batches: db.batches.filter((b) => b.campusId === activeCampusId),
        academicTerms: db.academicTerms.filter((t) => t.campusId === activeCampusId),
        calendarEvents: db.calendarEvents.filter((e) => e.campusId === activeCampusId),
        courses: db.courses.filter((c) => c.campusId === activeCampusId),
        curriculumVersions: db.curriculumVersions.filter((v) => v.campusId === activeCampusId),
        curriculumBlocks: db.curriculumBlocks.filter((b) => b.campusId === activeCampusId),
        curriculumModules: db.curriculumModules.filter((m) => m.campusId === activeCampusId),
        batchCurriculumDates: db.batchCurriculumDates.filter((bcd) => bcd.campusId === activeCampusId),
        designations: db.designations.filter((d) => d.campusId === activeCampusId),
        staff: campusStaff,
        students: campusStudents,
        groupSets: db.groupSets.filter((gs) => gs.campusId === activeCampusId),
        studentGroups: db.studentGroups.filter((sg) => sg.campusId === activeCampusId),
        studentGroupMembers: db.studentGroupMembers.filter((sgm) => sgm.campusId === activeCampusId),
        classes: db.classes.filter((c) => c.campusId === activeCampusId),
        sections: db.sections.filter((s) => s.campusId === activeCampusId),
        enrollments: db.enrollments.filter((e) => e.campusId === activeCampusId),
        teachingSlots: db.teachingSlots.filter((ts) => ts.campusId === activeCampusId),
        clinicalRotations: db.clinicalRotations.filter((cr) => cr.campusId === activeCampusId),
        sessions: db.sessions.filter((s) => s.campusId === activeCampusId),
        attendanceRecords: db.attendanceRecords.filter((ar) => ar.campusId === activeCampusId),
        correctionRequests: db.correctionRequests.filter((cr) => cr.campusId === activeCampusId),
        auditLogs: isSuperAdmin
          ? db.auditLogs.slice(0, 100)
          : db.auditLogs.filter((al) => al.campusId === activeCampusId).slice(0, 100),
        villageSummaries,
      },
    });
  });

  // POST /api/v1/sessions — Create session & take roster snapshot (Section 8.3)
  app.post('/api/v1/sessions', (req: Request, res: Response) => {
    const { user, roles, staffRecord } = getActor(req);
    const campusId = (req.headers['x-campus-id'] as string) || 'campus-amc';
    const {
      classId,
      sectionId,
      sessionDate,
      startTime,
      endTime,
      sessionType,
      clinicalSubtype,
      topic,
      conductedByStaffId,
      isSubstitute,
      venue,
      locationId,
      rotationId,
      defaultStatus = 'P',
      holidayOverrideReason,
      combinedSectionIds,
    } = req.body;

    if (!topic || String(topic).trim().length === 0) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: 'Topic covered is required to start a session.' },
      });
    }

    const cls = db.classes.find((c) => c.id === classId && c.campusId === campusId);
    const sec = db.sections.find((s) => s.id === sectionId && s.campusId === campusId);
    if (!cls || !sec) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Class or Section not found in this campus.' },
      });
    }

    const assignedStaff = Array.from(new Set([...cls.teacherStaffIds, ...sec.teacherStaffIds]));
    if (
      !can(user, roles, 'create_or_mark_session', {
        campusId,
        assignedStaffIds: assignedStaff,
        currentUserStaffId: staffRecord?.id || conductedByStaffId,
      })
    ) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You are not assigned to mark attendance for this section.',
        },
      });
    }

    // Check holiday/closure warning
    const holidayEvent = db.calendarEvents.find(
      (ev) =>
        ev.campusId === campusId &&
        (ev.type === 'holiday' || ev.type === 'closure') &&
        ev.startDate <= sessionDate &&
        ev.endDate >= sessionDate
    );
    if (holidayEvent && (!holidayOverrideReason || String(holidayOverrideReason).trim().length === 0)) {
      return res.status(409).json({
        error: {
          code: 'HOLIDAY_WARNING',
          message: `${sessionDate} is marked on the campus calendar as "${holidayEvent.title}" (${holidayEvent.type}). Provide a reason to log a session on this date.`,
        },
      });
    }

    const targetSections: Section[] =
      Array.isArray(combinedSectionIds) && combinedSectionIds.length > 1
        ? db.sections.filter((s) => combinedSectionIds.includes(s.id) && s.campusId === campusId)
        : [sec];

    // Check clashes for each target section
    const teacherId = conductedByStaffId || staffRecord?.id || cls.leadTeacherStaffId;
    for (const targetSec of targetSections) {
      const clash = detectSessionClash(
        {
          campusId,
          sectionId: targetSec.id,
          sessionDate,
          startTime,
          endTime,
          conductedByStaffId: teacherId,
          venue: venue || targetSec.venue || cls.venue,
        },
        db.sessions,
        db.enrollments
      );
      if (clash.hasClash) {
        return res.status(409).json({
          error: {
            code: 'SESSION_CLASH',
            message: clash.reason || 'Overlapping session detected.',
          },
        });
      }
    }

    // Auto-tag UHS Block & Module from batch calendar
    const tag = getCurriculumTag(
      cls.batchId,
      sessionDate,
      db.curriculumBlocks,
      db.curriculumModules,
      db.batchCurriculumDates
    );

    const [sh, sm] = String(startTime).split(':').map(Number);
    const [eh, em] = String(endTime).split(':').map(Number);
    const durationMin = Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
    const combinedGroupId = targetSections.length > 1 ? `comb-${Date.now()}` : null;

    const createdSessions = [];

    for (const targetSec of targetSections) {
      const enrolledStudents = db.enrollments.filter(
        (e) =>
          e.campusId === campusId &&
          e.sectionId === targetSec.id &&
          e.effectiveFrom <= sessionDate &&
          (!e.effectiveTo || e.effectiveTo >= sessionDate)
      );

      if (enrolledStudents.length === 0) {
        return res.status(422).json({
          error: {
            code: 'EMPTY_SECTION',
            message: `Section "${targetSec.name}" has zero enrolled students on ${sessionDate}. Enrol students first.`,
          },
        });
      }

      const newSession = {
        id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        campusId,
        classId: targetSec.classId,
        sectionId: targetSec.id,
        sessionDate,
        startTime,
        endTime,
        durationMin,
        sessionType: sessionType || cls.classType,
        clinicalSubtype: clinicalSubtype || undefined,
        topic: String(topic).trim(),
        conductedByStaffId: teacherId,
        isSubstitute: Boolean(isSubstitute),
        venue: venue || targetSec.venue || cls.venue,
        blockId: tag.block?.id || null,
        moduleId: tag.module?.id || null,
        tagOverridden: false,
        locationId: locationId || null,
        rotationId: rotationId || null,
        enteredFromPaper: false,
        state: 'draft' as const,
        combinedGroupId,
        version: 1,
        holidayOverrideReason: holidayOverrideReason || undefined,
      };

      db.sessions.unshift(newSession);

      // Snapshot roster
      for (const enr of enrolledStudents) {
        db.attendanceRecords.push({
          id: `ar-${newSession.id}-${enr.studentId}`,
          campusId,
          sessionId: newSession.id,
          studentId: enr.studentId,
          status: (defaultStatus === 'A' ? 'A' : 'P') as AttendanceStatus,
          markedByUserId: user.id,
          markedAt: new Date().toISOString(),
        });
      }

      appendAudit(
        campusId,
        user.id,
        user.name,
        'SESSION_CREATED',
        'session',
        newSession.id,
        null,
        {
          section: targetSec.name,
          date: sessionDate,
          topic: newSession.topic,
          rosterCount: enrolledStudents.length,
        },
        holidayOverrideReason
      );

      createdSessions.push(newSession);
    }

    saveDb(db);
    return res.status(201).json({ data: createdSessions[0], meta: { count: createdSessions.length } });
  });

  // PUT /api/v1/sessions/:id/records — Save draft or pre-lock edits with concurrency version check
  app.put('/api/v1/sessions/:id/records', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const sessionId = req.params.id;
    const { version, records, topic } = req.body;

    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found.' } });
    }

    const settings = db.campusSettings.find((cs) => cs.campusId === session.campusId) || db.campusSettings[0];
    const lockInfo = getSessionLockStatus(session, settings.lockHours);
    const isAdmin = can(user, roles, 'edit_locked_session', { campusId: session.campusId });

    if (lockInfo.isLocked && !isAdmin) {
      return res.status(403).json({
        error: {
          code: 'SESSION_LOCKED',
          message: 'This session is locked. Raise a Correction Request for post-lock changes.',
        },
      });
    }

    if (version !== undefined && Number(version) !== session.version) {
      return res.status(409).json({
        error: {
          code: 'VERSION_CONFLICT',
          message: `Session was updated by another user (current version ${session.version}). Reload before saving.`,
        },
      });
    }

    if (topic && String(topic).trim().length > 0) {
      session.topic = String(topic).trim();
    }

    if (Array.isArray(records)) {
      for (const rec of records) {
        const existing = db.attendanceRecords.find(
          (ar) => ar.sessionId === session.id && ar.studentId === rec.studentId
        );
        if (existing) {
          existing.status = rec.status;
          existing.remark = rec.remark;
          existing.markedByUserId = user.id;
          existing.markedAt = new Date().toISOString();
        }
      }
    }

    session.version += 1;
    saveDb(db);
    return res.json({ data: session });
  });

  // POST /api/v1/sessions/:id/submit — Submit attendance (Section 8.3)
  app.post('/api/v1/sessions/:id/submit', (req: Request, res: Response) => {
    const { user } = getActor(req);
    const sessionId = req.params.id;
    const { version, records, idempotencyKey, topic } = req.body;

    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      return res.json(idempotencyCache.get(idempotencyKey));
    }

    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found.' } });
    }

    if (session.state === 'locked' || session.state === 'cancelled') {
      return res.status(403).json({
        error: { code: 'INVALID_STATE', message: `Session is ${session.state} and cannot be submitted.` },
      });
    }

    if (version !== undefined && Number(version) !== session.version) {
      return res.status(409).json({
        error: { code: 'VERSION_CONFLICT', message: 'Updated by someone else. Please reload.' },
      });
    }

    if (topic && String(topic).trim().length > 0) {
      session.topic = String(topic).trim();
    }

    if (Array.isArray(records)) {
      for (const rec of records) {
        if ((rec.status === 'E' || rec.status === 'M') && (!rec.remark || !String(rec.remark).trim())) {
          return res.status(422).json({
            error: {
              code: 'REMARK_REQUIRED',
              message: `A reason/remark is mandatory for Excused (E) or Medical (M) status.`,
            },
          });
        }
      }
      for (const rec of records) {
        const existing = db.attendanceRecords.find(
          (ar) => ar.sessionId === session.id && ar.studentId === rec.studentId
        );
        if (existing) {
          existing.status = rec.status;
          existing.remark = rec.remark;
          existing.markedByUserId = user.id;
          existing.markedAt = new Date().toISOString();
        }
      }
    }

    const sessionRecords = db.attendanceRecords.filter((ar) => ar.sessionId === session.id);
    const counts = {
      P: sessionRecords.filter((r) => r.status === 'P').length,
      A: sessionRecords.filter((r) => r.status === 'A').length,
      L: sessionRecords.filter((r) => r.status === 'L').length,
      E: sessionRecords.filter((r) => r.status === 'E').length,
      M: sessionRecords.filter((r) => r.status === 'M').length,
      total: sessionRecords.length,
    };

    session.state = 'submitted';
    session.submittedAt = new Date().toISOString();
    session.version += 1;

    appendAudit(
      session.campusId,
      user.id,
      user.name,
      'SESSION_SUBMITTED',
      'session',
      session.id,
      null,
      counts,
      `Submitted attendance for ${session.topic}`
    );

    saveDb(db);
    const responsePayload = { data: { session, counts } };
    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, responsePayload);
    }
    return res.json(responsePayload);
  });

  // POST /api/v1/sessions/:id/lock — Lock session or Admin Direct Edit
  app.post('/api/v1/sessions/:id/admin-edit', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const sessionId = req.params.id;
    const { records, reason, lockNow } = req.body;

    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found.' } });
    }

    if (lockNow) {
      session.state = 'locked';
      session.lockedAt = new Date().toISOString();
      session.version += 1;
      appendAudit(session.campusId, user.id, user.name, 'SESSION_LOCKED', 'session', session.id, null, { state: 'locked' }, 'Locked session');
      saveDb(db);
      return res.json({ data: session });
    }

    if (!can(user, roles, 'edit_locked_session', { campusId: session.campusId })) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only Campus Admin or Super Admin can edit a locked session directly.' },
      });
    }

    if (!reason || String(reason).trim().length < 3) {
      return res.status(422).json({
        error: { code: 'REASON_REQUIRED', message: 'A mandatory reason is required to edit locked attendance.' },
      });
    }

    const changes: Array<{ studentId: string; from: string; to: string }> = [];
    if (Array.isArray(records)) {
      for (const rec of records) {
        const existing = db.attendanceRecords.find(
          (ar) => ar.sessionId === session.id && ar.studentId === rec.studentId
        );
        if (existing && existing.status !== rec.status) {
          changes.push({ studentId: rec.studentId, from: existing.status, to: rec.status });
          existing.status = rec.status;
          existing.remark = rec.remark;
          existing.markedByUserId = user.id;
          existing.markedAt = new Date().toISOString();
        }
      }
    }

    session.version += 1;
    appendAudit(
      session.campusId,
      user.id,
      user.name,
      'LOCKED_SESSION_ADMIN_EDIT',
      'session',
      session.id,
      { changesCount: changes.length },
      { changes },
      String(reason).trim()
    );

    saveDb(db);
    return res.json({ data: session });
  });

  // POST /api/v1/sessions/:id/cancel — Cancel session with required reason
  app.post('/api/v1/sessions/:id/cancel', (req: Request, res: Response) => {
    const { user } = getActor(req);
    const session = db.sessions.find((s) => s.id === req.params.id);
    const { reason } = req.body;
    if (!session) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found.' } });
    }
    if (!reason || String(reason).trim().length === 0) {
      return res.status(422).json({
        error: { code: 'REASON_REQUIRED', message: 'Cancellation reason is mandatory.' },
      });
    }
    session.state = 'cancelled';
    session.cancelReason = String(reason).trim();
    session.version += 1;
    appendAudit(session.campusId, user.id, user.name, 'SESSION_CANCELLED', 'session', session.id, null, { state: 'cancelled' }, session.cancelReason);
    saveDb(db);
    return res.json({ data: session });
  });

  // POST /api/v1/corrections — Raise post-lock correction request
  app.post('/api/v1/corrections', (req: Request, res: Response) => {
    const { user, staffRecord } = getActor(req);
    const { sessionId, reason, items } = req.body;
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found.' } });
    }
    if (!reason || !Array.isArray(items) || items.length === 0) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: 'Select at least one student and enter a reason.' },
      });
    }

    const reqItem = {
      id: `cr-${Date.now()}`,
      campusId: session.campusId,
      sessionId: session.id,
      requestedByUserId: user.id,
      requestedByStaffId: staffRecord?.id || session.conductedByStaffId,
      reason: String(reason).trim(),
      state: 'pending' as const,
      items,
      createdAt: new Date().toISOString(),
    };

    db.correctionRequests.unshift(reqItem);
    appendAudit(session.campusId, user.id, user.name, 'CORRECTION_REQUESTED', 'correction_request', reqItem.id, null, { itemsCount: items.length }, reqItem.reason);
    saveDb(db);
    return res.status(201).json({ data: reqItem });
  });

  // POST /api/v1/corrections/:id/review — Approve or Reject correction request
  app.post('/api/v1/corrections/:id/review', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const corr = db.correctionRequests.find((c) => c.id === req.params.id);
    if (!corr) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Correction request not found.' } });
    }

    const session = db.sessions.find((s) => s.id === corr.sessionId);
    const cls = session ? db.classes.find((c) => c.id === session.classId) : undefined;
    const settings = db.campusSettings.find((cs) => cs.campusId === corr.campusId) || db.campusSettings[0];

    if (
      !can(user, roles, 'approve_correction', {
        campusId: corr.campusId,
        departmentId: cls?.departmentId,
        hodCanApprove: settings.hodCanApprove,
      })
    ) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to review correction requests for this department.' },
      });
    }

    const { decision, comment } = req.body; // 'approved' | 'rejected'
    if (decision === 'rejected' && (!comment || String(comment).trim().length === 0)) {
      return res.status(422).json({
        error: { code: 'COMMENT_REQUIRED', message: 'A review comment is required when rejecting a correction request.' },
      });
    }

    corr.state = decision === 'approved' ? 'approved' : 'rejected';
    corr.reviewedByUserId = user.id;
    corr.reviewedAt = new Date().toISOString();
    corr.reviewComment = comment ? String(comment).trim() : 'Approved';

    if (corr.state === 'approved' && session) {
      for (const item of corr.items) {
        const rec = db.attendanceRecords.find(
          (ar) => ar.sessionId === session.id && ar.studentId === item.studentId
        );
        if (rec) {
          rec.status = item.toStatus;
          rec.remark = corr.reason;
          rec.markedByUserId = user.id;
          rec.markedAt = new Date().toISOString();
        }
      }
      session.version += 1;
    }

    appendAudit(
      corr.campusId,
      user.id,
      user.name,
      corr.state === 'approved' ? 'CORRECTION_APPROVED' : 'CORRECTION_REJECTED',
      'correction_request',
      corr.id,
      null,
      { state: corr.state, items: corr.items },
      corr.reviewComment
    );

    saveDb(db);
    return res.json({ data: corr });
  });

  // PATCH /api/v1/campuses/:id/settings — Update Campus Settings with before/after audit
  app.patch('/api/v1/campuses/:id/settings', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const campusId = req.params.id;
    if (!can(user, roles, 'edit_campus_settings', { campusId })) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not permitted to edit campus settings.' } });
    }

    const idx = db.campusSettings.findIndex((cs) => cs.campusId === campusId);
    if (idx === -1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Campus settings not found.' } });
    }

    const before = { ...db.campusSettings[idx] };
    db.campusSettings[idx] = {
      ...db.campusSettings[idx],
      ...req.body,
      campusId,
    };

    appendAudit(
      campusId,
      user.id,
      user.name,
      'CAMPUS_SETTINGS_UPDATED',
      'campus_settings',
      campusId,
      before as unknown as Record<string, unknown>,
      db.campusSettings[idx] as unknown as Record<string, unknown>,
      'Updated attendance threshold & calculation rules'
    );

    saveDb(db);
    return res.json({ data: db.campusSettings[idx] });
  });

  // POST /api/v1/departments/:id/hod — Select or change Department Head (Section 4.3, Prompt 4A)
  app.post('/api/v1/departments/:id/hod', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const dept = db.departments.find((d) => d.id === req.params.id);
    if (!dept) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Department not found.' } });
    }

    if (!can(user, roles, 'select_hod', { campusId: dept.campusId })) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only Campus Admin or Super Admin can appoint a Head of Department.' },
      });
    }

    const { staffId, startDate, orderNo } = req.body;
    const prevHodStaffId = dept.hodStaffId;

    // Close previous head's open history row
    const openHistory = db.departmentHeads.find(
      (dh) => dh.departmentId === dept.id && dh.endDate === null
    );
    if (openHistory) {
      openHistory.endDate = startDate || '2026-11-01';
    }

    // Remove previous HOD role assignment for this department if staff had a userId
    if (prevHodStaffId) {
      const prevStaff = db.staff.find((s) => s.id === prevHodStaffId);
      if (prevStaff?.userId) {
        db.roleAssignments = db.roleAssignments.filter(
          (ra) => !(ra.userId === prevStaff.userId && ra.role === 'HOD' && ra.departmentId === dept.id)
        );
      }
    }

    dept.hodStaffId = staffId || null;
    if (staffId) {
      db.departmentHeads.unshift({
        id: `dh-${Date.now()}`,
        campusId: dept.campusId,
        departmentId: dept.id,
        staffId,
        startDate: startDate || '2026-11-02',
        endDate: null,
        orderNo: orderNo || `AMC/HR/HOD/${new Date().getFullYear()}`,
      });

      const newStaff = db.staff.find((s) => s.id === staffId);
      if (newStaff?.userId) {
        db.roleAssignments.push({
          id: `ra-hod-${Date.now()}`,
          userId: newStaff.userId,
          role: 'HOD',
          campusId: dept.campusId,
          departmentId: dept.id,
        });
      }
    }

    appendAudit(
      dept.campusId,
      user.id,
      user.name,
      'DEPARTMENT_HEAD_CHANGED',
      'department',
      dept.id,
      { hodStaffId: prevHodStaffId },
      { hodStaffId: staffId, orderNo },
      `Appointed Head of Department for ${dept.name}`
    );

    saveDb(db);
    return res.json({ data: dept });
  });

  // POST /api/v1/students — Create Student Registration (Draft or Submitted)
  app.post('/api/v1/students', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const campusId = (req.headers['x-campus-id'] as string) || 'campus-amc';
    if (!can(user, roles, 'manage_students', { campusId })) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not permitted to register students.' } });
    }

    const body = req.body;
    const cleanCnic = String(body.cnic || '').replace(/\D/g, '');
    if (!isValidCNIC(cleanCnic)) {
      return res.status(422).json({
        error: { code: 'INVALID_CNIC', message: 'CNIC / B-Form must be exactly 13 digits (00000-0000000-0).' },
      });
    }

    const duplicate = db.students.find((s) => s.campusId === campusId && s.cnic === cleanCnic);
    if (duplicate) {
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_CNIC',
          message: `Duplicate CNIC warning: ${duplicate.name} (Father: ${duplicate.fatherName}) is already registered with this CNIC.`,
        },
      });
    }

    const newStudent: Student = {
      id: `stu-${Date.now()}`,
      campusId,
      programId: body.programId || 'prog-mbbs',
      batchId: body.batchId || 'batch-mbbs-26',
      registrationState: body.registrationState || 'submitted',
      regNo: null,
      rollNo: null,
      name: String(body.name || '').trim(),
      fatherName: String(body.fatherName || '').trim(),
      gender: body.gender || 'Male',
      dob: body.dob || '2007-05-10',
      cnic: cleanCnic,
      nationality: body.nationality || 'Pakistani',
      domicileProvince: body.domicileProvince || 'Punjab',
      domicileDistrict: body.domicileDistrict || 'Faisalabad',
      bloodGroup: body.bloodGroup || 'O+',
      mobile: body.mobile || '0300-1234567',
      email: body.email || 'student@amc.abwa.edu.pk',
      permanentAddress: body.permanentAddress || 'Faisalabad',
      city: body.city || 'Faisalabad',
      guardianName: body.guardianName || body.fatherName || 'Guardian',
      guardianRelation: body.guardianRelation || 'Father',
      guardianMobile: body.guardianMobile || body.mobile || '0300-1234567',
      admissionDate: body.admissionDate || '2026-11-02',
      admissionCategory: body.admissionCategory || 'Open Merit',
      mdcatRollNo: body.mdcatRollNo || `UHS-26-${Math.floor(92000 + Math.random() * 900)}`,
      mdcatScore: Number(body.mdcatScore || 172),
      aggregatePct: Number(body.aggregatePct || 89.5),
      matricObtained: Number(body.matricObtained || 1030),
      matricTotal: Number(body.matricTotal || 1100),
      fscObtained: Number(body.fscObtained || 1005),
      fscTotal: Number(body.fscTotal || 1100),
      hostelResident: Boolean(body.hostelResident),
      documents: [
        { docType: 'Matric Certificate', originalSeen: true },
        { docType: 'FSc (Pre-Medical) Result', originalSeen: true },
        { docType: 'MDCAT Official Scorecard', originalSeen: true },
        { docType: 'CNIC / B-Form Copy', originalSeen: true },
      ],
    };

    db.students.unshift(newStudent);
    appendAudit(campusId, user.id, user.name, 'STUDENT_REGISTERED', 'student', newStudent.id, null, {
      name: newStudent.name,
      state: newStudent.registrationState,
    });
    saveDb(db);
    return res.status(201).json({ data: newStudent });
  });

  // POST /api/v1/students/:id/transition — Verify, Return, or Activate Student (Section 4.4, 6.7)
  app.post('/api/v1/students/:id/transition', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const student = db.students.find((s) => s.id === req.params.id);
    if (!student) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student record not found.' } });
    }
    if (!can(user, roles, 'manage_students', { campusId: student.campusId })) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not permitted.' } });
    }

    const { targetState, note, groupId } = req.body;
    const prevState = student.registrationState;

    if (targetState === 'verified') {
      student.registrationState = 'verified';
      student.verifiedBy = user.name;
      student.verifiedAt = '2026-11-02';
      student.documents = student.documents.map((d) => ({
        ...d,
        originalSeen: true,
        verifiedBy: user.name,
        verifiedAt: '2026-11-02',
      }));
    } else if (targetState === 'returned') {
      student.registrationState = 'returned';
      student.returnNote = note || 'Missing original IBCC or domicile verification.';
    } else if (targetState === 'submitted') {
      student.registrationState = 'submitted';
      student.returnNote = undefined;
    } else if (targetState === 'active') {
      // Issue never-reused Roll Number and Registration Number from campus pattern
      const batchStudents = db.students.filter(
        (s) => s.campusId === student.campusId && s.batchId === student.batchId && s.rollNo !== null
      );
      const maxRoll = batchStudents.reduce((acc, s) => Math.max(acc, s.rollNo || 0), 0);
      const nextRoll = maxRoll + 1;
      const campus = db.campuses.find((c) => c.id === student.campusId);
      const prog = db.programs.find((p) => p.id === student.programId);
      const batch = db.batches.find((b) => b.id === student.batchId);
      const yy = String(batch?.intakeYear || 2026).slice(-2);

      student.rollNo = nextRoll;
      student.regNo = `${campus?.code || 'AMC'}-${prog?.code || 'MBBS'}-${yy}-${String(nextRoll).padStart(3, '0')}`;
      student.registrationState = 'active';
      student.activatedAt = '2026-11-02';

      // Automatically enrol into every "All" (default) section of their batch
      const batchClasses = db.classes.filter(
        (c) => c.campusId === student.campusId && c.batchId === student.batchId && c.status === 'active'
      );
      for (const cls of batchClasses) {
        const defaultSec = db.sections.find((sec) => sec.classId === cls.id && sec.isDefault);
        if (defaultSec) {
          db.enrollments.push({
            id: `enr-auto-${student.id}-${defaultSec.id}`,
            campusId: student.campusId,
            classId: cls.id,
            sectionId: defaultSec.id,
            studentId: student.id,
            effectiveFrom: '2026-11-02',
            effectiveTo: null,
            source: 'manual',
          });
        }
      }

      // Assign to Teaching Group and auto-enrol in linked group sections
      const assignedGrpId = groupId || 'grp-d';
      const grp = db.studentGroups.find((g) => g.id === assignedGrpId);
      if (grp) {
        db.studentGroupMembers.push({
          id: `sgm-auto-${student.id}`,
          campusId: student.campusId,
          groupSetId: grp.groupSetId,
          groupId: grp.id,
          studentId: student.id,
          effectiveFrom: '2026-11-02',
          effectiveTo: null,
        });

        const linkedSections = db.sections.filter(
          (sec) => sec.campusId === student.campusId && sec.studentGroupId === grp.id
        );
        for (const lSec of linkedSections) {
          db.enrollments.push({
            id: `enr-grp-${student.id}-${lSec.id}`,
            campusId: student.campusId,
            classId: lSec.classId,
            sectionId: lSec.id,
            studentId: student.id,
            effectiveFrom: '2026-11-02',
            effectiveTo: null,
            source: 'group_link',
          });
        }
      }
    } else if (['freeze', 'struck_off', 'left', 'graduated'].includes(targetState)) {
      student.registrationState = targetState;
      // Close all open enrollments on effective date
      for (const enr of db.enrollments) {
        if (enr.studentId === student.id && enr.effectiveTo === null) {
          enr.effectiveTo = '2026-11-02';
        }
      }
    }

    appendAudit(
      student.campusId,
      user.id,
      user.name,
      `STUDENT_STATUS_${String(targetState).toUpperCase()}`,
      'student',
      student.id,
      { state: prevState },
      { state: student.registrationState, regNo: student.regNo, rollNo: student.rollNo },
      note
    );

    saveDb(db);
    return res.json({ data: student });
  });

  // POST /api/v1/staff — Register new Teacher or Staff member
  app.post('/api/v1/staff', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const campusId = (req.headers['x-campus-id'] as string) || 'campus-amc';
    if (!can(user, roles, 'manage_staff', { campusId })) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not permitted to register staff.' } });
    }

    const body = req.body;
    const cleanCnic = String(body.cnic || '').replace(/\D/g, '');
    if (!isValidCNIC(cleanCnic)) {
      return res.status(422).json({
        error: { code: 'INVALID_CNIC', message: 'CNIC must be 13 digits.' },
      });
    }

    const campusStaffCount = db.staff.filter((s) => s.campusId === campusId).length + 1;
    const campus = db.campuses.find((c) => c.id === campusId);
    const staffCode = `${campus?.code || 'AMC'}-F-${String(campusStaffCount).padStart(4, '0')}`;

    const newStaff = {
      id: `staff-${Date.now()}`,
      campusId,
      userId: null,
      staffCode,
      category: body.category || 'teaching',
      designationId: body.designationId || 'des-asst',
      primaryDepartmentId: body.primaryDepartmentId || 'dept-anat',
      secondaryDepartmentIds: [],
      unitDepartmentId: null,
      name: String(body.name || '').trim(),
      fatherOrHusbandName: String(body.fatherOrHusbandName || 'Father').trim(),
      gender: body.gender || 'Male',
      dob: body.dob || '1985-05-15',
      cnic: cleanCnic,
      mobile: body.mobile || '0300-1122334',
      officialEmail: body.officialEmail || `faculty${campusStaffCount}@abwa.edu.pk`,
      employmentType: body.employmentType || 'permanent',
      bpsGrade: body.bpsGrade || 'BPS-18',
      joiningDate: body.joiningDate || '2026-11-01',
      pmdcNo: body.pmdcNo || undefined,
      pmdcExpiry: body.pmdcExpiry || undefined,
      qualifications: Array.isArray(body.qualifications) ? body.qualifications : ['MBBS', 'FCPS'],
      experienceYears: Number(body.experienceYears || 5),
      status: 'active' as const,
    };

    db.staff.push(newStaff);
    appendAudit(campusId, user.id, user.name, 'STAFF_REGISTERED', 'staff', newStaff.id, null, {
      staffCode,
      name: newStaff.name,
      category: newStaff.category,
    });
    saveDb(db);
    return res.status(201).json({ data: newStaff });
  });

  // POST /api/v1/classes — Create a Class + default Section "All" + Batch Enrolment (Prompt 5)
  app.post('/api/v1/classes', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const campusId = (req.headers['x-campus-id'] as string) || 'campus-amc';
    if (!can(user, roles, 'create_or_assign_classes', { campusId })) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'HODs and Teachers cannot create classes. Campus Admin required.' },
      });
    }

    const {
      courseId,
      batchId,
      termId,
      departmentId,
      classType,
      title,
      defaultDurationMin = 60,
      venue = 'Lecture Hall 2',
      leadTeacherStaffId,
      enrolWholeBatch = true,
    } = req.body;

    const newClass = {
      id: `cls-${Date.now()}`,
      campusId,
      courseId,
      batchId,
      termId: termId || 'term-amc-1st-26',
      departmentId,
      classType: classType || 'lecture',
      title: String(title).trim(),
      defaultDurationMin: Number(defaultDurationMin),
      venue,
      leadTeacherStaffId,
      teacherStaffIds: [leadTeacherStaffId].filter(Boolean),
      status: 'active' as const,
    };

    const defaultSec: Section = {
      id: `sec-${Date.now()}`,
      campusId,
      classId: newClass.id,
      name: 'All (Full Batch)',
      studentGroupId: null,
      capacity: 150,
      isDefault: true,
      venue,
      teacherStaffIds: [leadTeacherStaffId].filter(Boolean),
      status: 'active',
    };

    db.classes.push(newClass);
    db.sections.push(defaultSec);

    let enrolledCount = 0;
    if (enrolWholeBatch) {
      const activeStudents = db.students.filter(
        (s) => s.campusId === campusId && s.batchId === batchId && s.registrationState === 'active'
      );
      for (const stu of activeStudents) {
        db.enrollments.push({
          id: `enr-${newClass.id}-${stu.id}`,
          campusId,
          classId: newClass.id,
          sectionId: defaultSec.id,
          studentId: stu.id,
          effectiveFrom: '2026-09-01',
          effectiveTo: null,
          source: 'manual',
        });
        enrolledCount++;
      }
    }

    appendAudit(campusId, user.id, user.name, 'CLASS_CREATED', 'class', newClass.id, null, {
      title: newClass.title,
      defaultSection: 'All (Full Batch)',
      enrolledCount,
    });
    saveDb(db);
    return res.status(201).json({ data: { class: newClass, defaultSection: defaultSec, enrolledCount } });
  });

  // POST /api/v1/groups/move-student — Move student between groups/sections preserving past history (Prompt 6 & 6A)
  app.post('/api/v1/groups/move-student', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    const campusId = (req.headers['x-campus-id'] as string) || 'campus-amc';
    if (!can(user, roles, 'manage_groups_and_sections', { campusId })) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Campus Admin required to move students between groups.' } });
    }

    const { studentId, targetGroupId, moveDate = '2026-11-02' } = req.body;
    const targetGroup = db.studentGroups.find((g) => g.id === targetGroupId && g.campusId === campusId);
    if (!targetGroup) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Target group not found.' } });
    }

    // Close existing open group membership in that groupSet
    const currentMembership = db.studentGroupMembers.find(
      (m) => m.studentId === studentId && m.groupSetId === targetGroup.groupSetId && m.effectiveTo === null
    );
    const oldGroupId = currentMembership?.groupId;
    if (currentMembership) {
      currentMembership.effectiveTo = moveDate;
    }

    // Open new membership
    db.studentGroupMembers.push({
      id: `sgm-${Date.now()}`,
      campusId,
      groupSetId: targetGroup.groupSetId,
      groupId: targetGroup.id,
      studentId,
      effectiveFrom: moveDate,
      effectiveTo: null,
    });

    // Move enrollments in all sections linked to this group set
    const linkedTargetSections = db.sections.filter(
      (s) => s.campusId === campusId && s.studentGroupId === targetGroup.id
    );
    for (const targetSec of linkedTargetSections) {
      const openEnr = db.enrollments.find(
        (e) => e.classId === targetSec.classId && e.studentId === studentId && e.effectiveTo === null
      );
      if (openEnr) {
        openEnr.effectiveTo = moveDate;
      }
      db.enrollments.push({
        id: `enr-move-${Date.now()}-${targetSec.id}`,
        campusId,
        classId: targetSec.classId,
        sectionId: targetSec.id,
        studentId,
        effectiveFrom: moveDate,
        effectiveTo: null,
        source: 'group_link',
      });
    }

    appendAudit(
      campusId,
      user.id,
      user.name,
      'STUDENT_GROUP_MOVED',
      'student_group_member',
      studentId,
      { fromGroupId: oldGroupId },
      { toGroupId: targetGroup.id, effectiveFrom: moveDate },
      `Moved student to ${targetGroup.name}; historical attendance preserved in previous section`
    );

    saveDb(db);
    return res.json({ data: { studentId, targetGroupId, moveDate } });
  });

  // POST /api/v1/campuses — Super Admin creates a new campus
  app.post('/api/v1/campuses', (req: Request, res: Response) => {
    const { user, roles } = getActor(req);
    if (!can(user, roles, 'manage_campuses')) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Super Admin required to create campuses.' } });
    }
    const { name, code, type = 'college', termType = 'annual', address = 'ABWA Knowledge Village, Faisalabad' } = req.body;
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!name || !cleanCode) {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Campus name and short code are required.' } });
    }

    const newCampus = {
      id: `campus-${cleanCode.toLowerCase()}-${Date.now()}`,
      orgId: 'org-abwa',
      name: String(name).trim(),
      code: cleanCode,
      type,
      termType,
      timezone: 'Asia/Karachi',
      address,
      contact: 'info@abwa.edu.pk',
      status: 'active' as const,
    };

    db.campuses.push(newCampus);
    db.campusSettings.push({
      campusId: newCampus.id,
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
      regNoPattern: `${cleanCode}-DEG-{YY}-{###}`,
      rollNoPattern: '{###}',
      staffCodePattern: `${cleanCode}-F-{####}`,
    });

    appendAudit(newCampus.id, user.id, user.name, 'CAMPUS_CREATED', 'campus', newCampus.id, null, {
      name: newCampus.name,
      code: newCampus.code,
    });
    saveDb(db);
    return res.status(201).json({ data: newCampus });
  });

  // Vite middleware in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ABWA Campus Management System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
