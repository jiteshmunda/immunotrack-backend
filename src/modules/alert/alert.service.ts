import { db } from "../../db";
import { alerts } from "../../db/schema/ai.schema";
import { patients, clinicians, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { users } from "../../db/schema/user.schema";
import { patientMedications } from "../../db/schema/tracking.schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { decrypt } from "../../utils/encryption";

export class AlertService {

  // -----------------------------GET /alerts------------------------------------------
  
  async getAlerts(clinicianUserId: string) {
    const [clinician] = await db
      .select()
      .from(clinicians)
      .where(eq(clinicians.userId, clinicianUserId))
      .limit(1);

    if (!clinician) throw new Error("CLINICIAN_NOT_FOUND");

    const results = await db
      .select({
        id: alerts.id,
        patient_id: alerts.patientId,
        alert_type: alerts.alertType,
        severity: alerts.severity,
        status: alerts.status,
        description: alerts.description,
        created_at: alerts.createdAt,
        last_triggered_at: alerts.lastTriggeredAt,
        risk_score: alerts.riskScore,
        medication_name: patientMedications.name,
        patient_name: users.fullName,
      })
      .from(alerts)
      .innerJoin(patients, eq(alerts.patientId, patients.id))
      .innerJoin(users, eq(patients.userId, users.id))
      .innerJoin(
        patientClinicianAssignments,
        eq(patients.id, patientClinicianAssignments.patientId)
      )
      .leftJoin(
        patientMedications,
        eq(alerts.patientMedicationId, patientMedications.id)
      )
      .where(
        and(
          eq(patientClinicianAssignments.clinicianId, clinician.id),
          eq(alerts.status, "active")
        )
      )
      .orderBy(desc(alerts.lastTriggeredAt));

    return results.map((r) => {
      let mappedType = r.alert_type?.toLowerCase() || "";
      if (mappedType === "symptom deterioration") mappedType = "symptom_deterioration";
      if (mappedType === "medication non-adherence") mappedType = "medication_non_adherence";

      return {
        id: r.id,
        patient_id: r.patient_id,
        patient_name: decrypt(r.patient_name!),
        alert_type: mappedType,
        description: r.description ? decrypt(r.description) : null,
        severity: r.severity,
        status: r.status,
        created_at: r.created_at,
        lastTriggeredAt: r.last_triggered_at,
        risk_score: r.risk_score ? parseFloat(r.risk_score) : null,
        medication_name: r.medication_name ? decrypt(r.medication_name) : null,
      };
    });
  }

  // -----------------------------PATCH /alerts/:id/resolve------------------------------------------

  async resolveAlert(alertId: string, clinicianUserId: string, resolutionNote?: string) {
    const [alert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, alertId))
      .limit(1);

    if (!alert) throw new Error("ALERT_NOT_FOUND");

    const [updated] = await db
      .update(alerts)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        resolvedBy: clinicianUserId,
        resolutionNote: resolutionNote || null,
      })
      .where(eq(alerts.id, alertId))
      .returning();

    return { 
      success: true, 
      resolved_at: updated.resolvedAt,
      resolution_note: updated.resolutionNote 
    };
  }
}
