export const MEDICATION_FREQUENCIES = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Four times daily",
  "As needed (PRN)",
  "Weekly",
  "Twice weekly",
  "Every 2-4 hours",
  "Every 4-6 hours",
  "Every 4-6 hours (max 3-4 times/day)",
  "Every 10-12 hours (max 3 days)",
  "Every 2-4 weeks",
  "Monthly",
  "Every 3 months"
] as const;

/**
 * Maps clinical frequency strings to a numerical daily dose count.
 * Used for adherence calculations.
 */
export function getDailyFrequency(freq: string): number {
  const f = freq.toLowerCase();
  
  // PRN / As Needed (Usually not counted in scheduled adherence denominator)
  if (f.includes("as needed") || f.includes("prn")) return 0;
  
  // Daily Frequencies
  if (f.includes("four times") || f.includes("qid") || f.includes("4 times") || f.includes("4x daily")) return 4;
  if (f.includes("three times") || f.includes("tid") || f.includes("3 times")) return 3;
  if (f.includes("twice daily") || f.includes("bid")) return 2;
  if (f.includes("once daily") || f.includes("daily") || f.includes("qday")) return 1;
  
  // Ranges
  if (f.includes("once or twice")) return 1.5;
  if (f.includes("2-3 times")) return 2.5;
  if (f.includes("3-4 times")) return 3.5;
  if (f.includes("3-6 times")) return 4.5;
  
  // Hourly Intervals
  if (f.includes("every 2-4 hours") || f.includes("every 2–4 hours")) return 8;
  if (f.includes("every 4 hours")) return 6;
  if (f.includes("every 4-6 hours (max 3-4 times/day)") || f.includes("every 4–6 hours (max 3–4 times/day)")) return 3.5;
  if (f.includes("every 4-6 hours") || f.includes("every 4–6 hours")) return 5;
  if (f.includes("every 6 hours")) return 4;
  if (f.includes("every 8 hours")) return 3;
  if (f.includes("every 8-10 hours") || f.includes("every 8–10 hours")) return 2.5;
  if (f.includes("every 10-12 hours") || f.includes("every 10–12 hours")) return 2;
  if (f.includes("every 12 hours")) return 2;

  // Bi-weekly / Monthly / Quarterly (Normalized to daily for 30-day window)
  if (f.includes("every 2 weeks") || f.includes("every 2 weeks")) return 1 / 14;
  if (f.includes("every 4 weeks") || f.includes("every 4 weeks")) return 1 / 28;
  if (f.includes("every 2-4 weeks") || f.includes("every 2–4 weeks")) return 1 / 21;
  if (f.includes("every 3 months") || f.includes("every 3 months")) return 1 / 90;
  if (f.includes("monthly")) return 1 / 30;
  
  return 1; // Default
}
