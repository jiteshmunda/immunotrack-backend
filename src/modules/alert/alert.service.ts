import { db } from "../../db";
import { alerts } from "../../db/schema/ai.schema";
import { patients, clinicians, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { users } from "../../db/schema/user.schema";
import { patientMedications } from "../../db/schema/tracking.schema";
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import { decrypt } from "../../utils/encryption";

export class AlertService {

  // -----------------------------GET /alerts------------------------------------------
  
  async getAlerts(clinicianUserId: string) {
    const targetClinicians = await db
      .select({ id: clinicians.id })
      .from(clinicians)
      .where(or(
        eq(clinicians.userId, clinicianUserId),
        eq(clinicians.createdBy, clinicianUserId)
      ));

    if (targetClinicians.length === 0) throw new Error("CLINICIAN_NOT_FOUND");
    const clinicianIds = targetClinicians.map(c => c.id);

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
        domain: alerts.domain,
        alert_subtype: alerts.alertSubtype,
        severity_from: alerts.severityFrom,
        severity_to: alerts.severityTo,
        composite_score_at_trigger: alerts.compositeScoreAtTrigger,
        composite_score_current: alerts.compositeScoreCurrent,
        streak_days: alerts.streakDays,
        weekly_change_pct: alerts.weeklyChangePct,
        resolved_at: alerts.resolvedAt,
        resolution_note: alerts.resolutionNote,
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
          inArray(patientClinicianAssignments.clinicianId, clinicianIds),
          inArray(alerts.status, ["active", "resolved"])
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
        resolved_at: r.resolved_at,
        resolution_note: r.resolution_note,
        risk_score: r.risk_score ? parseFloat(r.risk_score) : null,
        domain: r.domain,
        alert_subtype: r.alert_subtype,
        severity_from: r.severity_from,
        severity_to: r.severity_to,
        composite_score_at_trigger: r.composite_score_at_trigger ? parseFloat(r.composite_score_at_trigger) : null,
        composite_score_current: r.composite_score_current ? parseFloat(r.composite_score_current) : null,
        streak_days: r.streak_days,
        weekly_change_pct: r.weekly_change_pct ? parseFloat(r.weekly_change_pct) : null,
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
