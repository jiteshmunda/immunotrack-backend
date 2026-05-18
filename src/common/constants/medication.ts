export const MEDICATION_FREQUENCIES = [
  "Once daily",
  "Once or twice daily",
  "Once daily (evening)",
  "Every 4-6 hours",
  "3-4 times daily",
  "Once daily (empty stomach)",
  "Twice daily",
  "Every 10-12 hours (max 3 days)",
  "Every 8-10 hours (max 3 days)",
  "Every 4 hours",
  "2-3 times daily",
  "4x daily (IR) or 2x daily (ER)",
  "Twice daily (or once daily for Ellipta)",
  "Twice daily (also MART strategy)",
  "Every 4-6 hours PRN",
  "Every 4-8 hours PRN",
  "Every 2-4 weeks",
  "Every 4 weeks",
  "Every 4 weeks (IV infusion)",
  "Every 4 weeks (loading) then every 8 weeks",
  "Every 2 weeks",
  "Once daily (investigational)",
  "3-6 times daily",
  "4 times daily",
  "As needed (anaphylaxis emergency)",
  "Weekly (build-up), Monthly (maintenance)",
  "Once daily (start 4 months before grass season)",
  "Once daily (start 12 weeks before ragweed season)",
  "Daily (maintenance)",
  "As needed (PRN)"
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
  if (f.includes("once daily") || f.includes("daily") || f.includes("qday")) return 1;
  if (f.includes("twice daily") || f.includes("bid")) return 2;
  if (f.includes("three times") || f.includes("tid") || f.includes("3 times")) return 3;
  if (f.includes("four times") || f.includes("qid") || f.includes("4 times") || f.includes("4x daily")) return 4;
  
  // Ranges
  if (f.includes("once or twice")) return 1.5;
  if (f.includes("2-3 times")) return 2.5;
  if (f.includes("3-4 times")) return 3.5;
  if (f.includes("3-6 times")) return 4.5;
  
  // Hourly Intervals
  if (f.includes("every 4 hours")) return 6;
  if (f.includes("every 4-6 hours")) return 5;
  if (f.includes("every 6 hours")) return 4;
  if (f.includes("every 8 hours")) return 3;
  if (f.includes("every 8-10 hours")) return 2.5;
  if (f.includes("every 10-12 hours")) return 2;
  if (f.includes("every 12 hours")) return 2;

  // Bi-weekly / Monthly (Normalized to daily for 30-day window)
  if (f.includes("every 2 weeks")) return 1 / 14;
  if (f.includes("every 4 weeks")) return 1 / 28;
  if (f.includes("every 2-4 weeks")) return 1 / 21;
  
  return 1; // Default
}
