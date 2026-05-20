export interface MedicationReminderParams {
  patientName: string;
  medName: string;
  adherence: number;
}

export interface BiologicTestParams {
  patientName: string;
}

export interface MedicationDoseReminderParams {
  patientName: string;
  medName: string;
  dose: string;
  time: string;
}

export interface PatientDeteriorationParams {
  patientName: string;
  riskScore: number;
}

export const NotificationTemplates = {
  /**
   * Patient Low-Adherence reminder alert
   */
  medication_reminder: (params: MedicationReminderParams) => ({
    title: `Adherence Alert: ${params.medName}`,
    body: `Hi ${params.patientName}, your weekly adherence for ${params.medName} is at ${Math.round(params.adherence)}%. Please log your doses to keep your clinician updated!`,
    pushBody: `Your weekly adherence for ${params.medName} has fallen below the 80% threshold. Tap to view securely.`
  }),

  /**
   * Scheduled daily dosage alarm
   */
  medication_dose_reminder: (params: MedicationDoseReminderParams) => ({
    title: `Medication Reminder: ${params.medName}`,
    body: `Hi ${params.patientName}, it's ${params.time}! Time to take your scheduled dose of ${params.medName} (${params.dose}). `,
    pushBody: `Time to take your scheduled dose of ${params.medName}. Tap to log securely in ImmunoTrack.`
  }),

  /**
   * Biologic/Low frequency therapy reminder
   */
  biologic_reminder: (params: BiologicTestParams) => ({
    title: `Adherence Alert: Biologic Therapy (${params.patientName})`,
    body: `Hi ${params.patientName}, your scheduled Dupixent injection is due today. Tap to mark as administered.`,
    pushBody: `You have a scheduled therapy due today. Tap to securely log in ImmunoTrack.`
  }),

  /**
   * Patient symptom score deterioration warning (Clinician-facing)
   */
  patient_deterioration: (params: PatientDeteriorationParams) => ({
    title: `Symptom Alert: ${params.patientName}`,
    body: `Patient's overall risk score has reached ${params.riskScore.toFixed(1)}/10.`,
    pushBody: `A patient's overall risk score has triggered an alert. Tap to view securely.`
  })
};
