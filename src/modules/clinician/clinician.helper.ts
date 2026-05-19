import { calculateRiskScore, getStatusColor } from "../symptoms/utils/symptom-scores";

/**
 * Calculates the difference and direction between a current and previous score.
 */
export function calculateTrend(current: number, previous: number) {
  const diff = parseFloat((current - previous).toFixed(2));
  return {
    direction: diff > 0 ? "up" : diff < 0 ? "down" : "stable" as "up" | "down" | "stable",
    value: Math.abs(diff),
    text: "vs last 7 days",
  };
}

/**
 * Maps standard clinical color badges to UI status labels.
 */
export function mapStatus(color: string): string {
  if (color === "green") return "Low";
  if (color === "amber") return "Medium";
  if (color === "red") return "High";
  return "N/A";
}

/**
 * Formats the composite summary chips for the clinician dashboard.
 */
export function formatCompositeSummary(latestLog: any, log7DaysAgo: any) {
  const getDomainData = (domain: "respiratory" | "nasal" | "skin", label: string) => {
    const current = latestLog ? (domain === "respiratory" ? parseFloat(latestLog.respiratoryComposite) : latestLog[`${domain}Composite`]) : 0;
    const previous = log7DaysAgo ? (domain === "respiratory" ? parseFloat(log7DaysAgo.respiratoryComposite) : log7DaysAgo[`${domain}Composite`]) : 0;
    const color = latestLog ? getStatusColor(domain, current) : "green";

    return {
      value: current,
      label,
      status: latestLog ? mapStatus(color) : "N/A",
      status_color: color,
      trend: calculateTrend(current, previous),
    };
  };

  return {
    respiratory: getDomainData("respiratory", "Respiratory (ACQ Mean)"),
    nasal: getDomainData("nasal", "Nasal (SNOT Subset)"),
    skin: getDomainData("skin", "Skin (POEM)"),
  };
}

/**
 * Transforms daily logs into the structured trend format for the UI.
 */
export function formatSymptomTrends(logs: any[]) {
  return logs.map(l => ({
    date: l.logDate!,
    respiratory: parseFloat(l.respiratoryComposite),
    nasal: l.nasalComposite,
    skin: l.skinComposite,
    risk_score: calculateRiskScore(parseFloat(l.respiratoryComposite), l.nasalComposite, l.skinComposite),
    sub_items: {
      acq: {
        acq1: l.acq1NightWaking, acq2: l.acq2MorningSymptoms, acq3: l.acq3ActivityLimitation,
        acq4: l.acq4ShortnessOfBreath, acq5: l.acq5Wheeze, acq6: l.acq6RelieverUse,
        mean: parseFloat(l.respiratoryComposite),
      },
      snot: {
        sn1: l.sn1NasalBlockage, sn2: l.sn2RunnyNose, sn3: l.sn3Sneezing,
        sn4: l.sn4SmellTaste, sn5: l.sn5PostNasalDrip, sn6: l.sn6FacialPain,
        sum: l.nasalComposite,
      },
      poem: {
        sk1: l.sk1Itch, sk2: l.sk2SleepDisturbance, sk3: l.sk3Bleeding,
        sk4: l.sk4Weeping, sk5: l.sk5Cracked, sk6: l.sk6Flaking,
        sk7: l.sk7Dryness, sum: l.skinComposite,
      },
    },
  })).reverse();
}

/**
 * Formats the patient header information including decryption.
 */
export function formatPatientHeader(patientData: any, clinicianName: string, lastLogDate: string, decrypt: (val: string) => string) {
  const { user, patient } = patientData;
  let dobFormatted = null;
  let age = null;

  if (patient.dateOfBirth) {
    const rawDob = decrypt(patient.dateOfBirth);
    const dateObj = new Date(rawDob);
    if (!isNaN(dateObj.getTime())) {
      // MM/DD/YYYY
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const yyyy = dateObj.getFullYear();
      dobFormatted = `${mm}/${dd}/${yyyy}`;
      age = new Date().getFullYear() - yyyy;
    } else {
      dobFormatted = rawDob;
    }
  }

  return {
    name: decrypt(user.fullName!),
    mrn: patient.mrn ? decrypt(patient.mrn) : null,
    dob: dobFormatted ? `${dobFormatted} (${age} y)` : null,
    sex: patient.sex,
    phone: patient.phone ? decrypt(patient.phone) : null,
    primary_diagnosis: patient.primaryDiagnosis ? decrypt(patient.primaryDiagnosis) : null,
    last_log: lastLogDate,
    clinician: clinicianName,
  };
}

/**
 * Calculates medication adherence (doses taken vs expected) for a 30-day window.
 */
export function calculateMedicationAdherence(
  activeMeds: any[], 
  takenMap: Record<string, number>, 
  thirtyDaysAgo: Date, 
  getDailyFrequency: (freq: string) => number
) {
  let dosesTaken = 0;
  let dosesExpected = 0;
  const now = new Date();

  for (const med of activeMeds) {
    const dailyFreq = getDailyFrequency(med.frequency);
    if (dailyFreq === 0) continue;

    const medStartDate = med.startDate ? new Date(med.startDate) : med.createdAt;
    const windowStart = thirtyDaysAgo > medStartDate ? thirtyDaysAgo : medStartDate;
    
    const daysActive = Math.ceil(Math.abs(now.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24));
    
    dosesExpected += daysActive * dailyFreq;
    dosesTaken += takenMap[med.id] || 0;
  }

  const rawPercentage = dosesExpected > 0 ? Math.round((dosesTaken / dosesExpected) * 100) : 0;
  return {
    percentage: Math.min(rawPercentage, 100),
    taken: dosesTaken,
    expected: dosesExpected,
  };
}
