import { db } from "../../db";
import { users } from "../../db/schema/user.schema";
import { clinicians, patients, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { dailyLogs } from "../../db/schema/tracking.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { roles } from "../../db/schema/role.schema";
import { patientClinicalNotes } from "../../db/schema/clinical-note.schema";
import { hashForLookup, encrypt, decrypt } from "../../utils/encryption";
import { hashPassword } from "../../utils/hash";
import { eq, desc, and, sql } from "drizzle-orm";
import crypto from "crypto";
import { CreateClinicianInput } from "./clinician.schema";
import { calculateRiskScore, getSeverityLevel } from "../symptoms/utils/symptom-scores";

export class ClinicianService {

// -----------------------------------------------------POST /clinician/create--------------------------------------------------
  async createClinician(input: CreateClinicianInput) {
    // 1. Generate secure random 16-character temporary password
    const tempPassword = crypto.randomBytes(8).toString("hex");
    
    const emailHash = hashForLookup(input.email);
    const encryptedEmail = encrypt(input.email);
    const hashedPassword = await hashPassword(tempPassword);

    // 2. Fetch the 'clinician' role ID
    const [clinicianRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "clinician"))
      .limit(1);

    if (!clinicianRole) {
      throw new Error("Clinician role not found in system");
    }

    return await db.transaction(async (tx) => {
      // 3. Create base User (Encrypted fullName for consistency)
      const [newUser] = await tx
        .insert(users)
        .values({
          fullName: encrypt(input.fullName),
          email: encryptedEmail,
          emailHash: emailHash,
          passwordHash: hashedPassword,
          roleId: clinicianRole.id,
          status: "active",
          isTempPassword: true,
          passwordChangedAt: new Date(),
        })
        .returning();

      // 4. Handle Clinic linking or creation
      let clinicId: string | null = null;
      if (input.organizationName) {
        const [existingClinic] = await tx
          .select({ id: clinics.id })
          .from(clinics)
          .where(eq(clinics.name, input.organizationName))
          .limit(1);

        if (existingClinic) {
          clinicId = existingClinic.id;
        } else {
          const [newClinic] = await tx
            .insert(clinics)
            .values({ name: input.organizationName })
            .returning({ id: clinics.id });
          clinicId = newClinic.id;
        }
      }

      // 5. Create Clinician Profile
      const encryptedLicense = input.licenseNumber ? encrypt(input.licenseNumber) : null;
      const encryptedNpi = encrypt(input.npiNumber);
      const encryptedPhone = input.phone ? encrypt(input.phone) : null;

      await tx.insert(clinicians).values({
        userId: newUser.id,
        clinicId: clinicId,
        licenseNumber: encryptedLicense,
        npiNumber: encryptedNpi,
        phone: encryptedPhone,
        stateOfLicensure: input.stateOfLicensure,
        clinicalRole: input.role,
        specialty: input.specialty,
        organizationName: input.organizationName,
      });

      return {
        clinicianId: newUser.id,
        tempPassword,
      };
    });
  }

  // ---------------------------------------------------- GET Assigned Patients with Risk Calculation ---------------------------------------------------

  async getAssignedPatients(userId: string) {
    // 1. Get clinician profile
    const [clinician] = await db
      .select()
      .from(clinicians)
      .where(eq(clinicians.userId, userId))
      .limit(1);

    if (!clinician) throw new Error("CLINICIAN_NOT_FOUND");

    // 2. Fetch all assigned patients with their core user data
    const assignedPatients = await db
      .select({
        id: patients.id,
        fullName: users.fullName,
        primaryDiagnosis: patients.primaryDiagnosis,
      })
      .from(patientClinicianAssignments)
      .innerJoin(patients, eq(patientClinicianAssignments.patientId, patients.id))
      .innerJoin(users, eq(patients.userId, users.id))
      .where(eq(patientClinicianAssignments.clinicianId, clinician.id));

    if (assignedPatients.length === 0) {
      return {
        total_patient_count: 0,
        total_high_risk_count: 0,
        patients: [],
      };
    }

    // 3. For each patient, fetch the latest daily log to calculate risk
    const patientIds = assignedPatients.map((p) => p.id);
    
    const latestLogs = await db
      .select()
      .from(dailyLogs)
      .where(sql`${dailyLogs.patientId} IN ${patientIds}`)
      .orderBy(dailyLogs.patientId, desc(dailyLogs.logDate), desc(dailyLogs.loggedAt));
    
    const latestLogMap = latestLogs.reduce((acc: Record<string, any>, log) => {
      if (!acc[log.patientId]) {
        acc[log.patientId] = log;
      }
      return acc;
    }, {});

    let highRiskCount = 0;
    const patientList = assignedPatients.map((p) => {
      const latestLog = latestLogMap[p.id];
      let riskScore = 0;
      let riskLevel = "Low";
      let lastLoggedDate = null;

      if (latestLog) {
        lastLoggedDate = latestLog.loggedAt;
        riskScore = calculateRiskScore(
          parseFloat(latestLog.respiratoryComposite),
          latestLog.nasalComposite,
          latestLog.skinComposite
        );
        riskLevel = getSeverityLevel(riskScore);

        if (riskLevel === "High") highRiskCount++;
      }

      return {
        id: p.id,
        name: decrypt(p.fullName!),
        primary_diagnosis: p.primaryDiagnosis ? decrypt(p.primaryDiagnosis) : null,
        last_logged_date: lastLoggedDate,
        risk_score: riskScore,
        risk_level: riskLevel,
      };
    });

    return {
      total_patient_count: assignedPatients.length,
      total_high_risk_count: highRiskCount,
      patients: patientList,
    };
  }

  // ------------------------------------------------------POST /clinician/create-notes -------------------------------------------------------

  async createClinicalNote(clinicianUserId: string, patientId: string, input: { noteType: string; notes: string }) {
    const [clinician] = await db
      .select({
        id: clinicians.id,
        fullName: users.fullName,
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.userId, clinicianUserId))
      .limit(1);

    if (!clinician) throw new Error("CLINICIAN_NOT_FOUND");

    const [patient] = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);

    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const encryptedNotes = encrypt(input.notes);

    const [newNote] = await db
      .insert(patientClinicalNotes)
      .values({
        patientId,
        clinicianId: clinician.id,
        noteType: input.noteType,
        notes: encryptedNotes,
      })
      .returning();

    return {
      note_type: newNote.noteType,
      notes: decrypt(newNote.notes),
      created_at: newNote.createdAt,
      clinician_name: decrypt(clinician.fullName!),
    };
  }


}
