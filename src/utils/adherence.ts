/**
 * Result of adherence window calculation
 */
export interface AdherenceWindow {
  windowStartDate: Date;
  windowEndDate: Date;
  totalDays: number;
}

/**
 * Calculates the adherence window based on a start date and an optional range of days.
 * 
 * @param itemStartDate The date the tracking started (e.g. medication start date)
 * @param rangeDays Optional number of recent days to look back (e.g. 7 for last week)
 * @param targetDate The "current" date for calculation (defaults to today)
 */
export function calculateAdherenceWindow(
  itemStartDate: Date | string,
  rangeDays?: number,
  targetDate: Date = new Date()
): AdherenceWindow {
  // Normalize everything to UTC midnight for comparison
  const today = new Date(targetDate);
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  let startUTC: Date;
  if (typeof itemStartDate === 'string') {
    const parts = itemStartDate.split('-');
    if (parts.length === 3) {
        startUTC = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    } else {
        startUTC = new Date(itemStartDate);
        startUTC = new Date(Date.UTC(startUTC.getUTCFullYear(), startUTC.getUTCMonth(), startUTC.getUTCDate()));
    }
  } else {
    startUTC = new Date(Date.UTC(itemStartDate.getUTCFullYear(), itemStartDate.getUTCMonth(), itemStartDate.getUTCDate()));
  }

  // Total days since start (inclusive)
  const diffTimeSinceStart = todayUTC.getTime() - startUTC.getTime();
  let daysSinceStart = Math.floor(diffTimeSinceStart / (1000 * 60 * 60 * 24)) + 1;
  if (daysSinceStart < 0) daysSinceStart = 0;
  
  // Guard against highly corrupt database dates (e.g. year 34534) that break Postgres boundaries
  if (startUTC.getUTCFullYear() > 3000 || startUTC.getUTCFullYear() < 1900 || Number.isNaN(startUTC.getTime())) {
    startUTC = new Date(Date.UTC(2024, 0, 1)); // Default fallback
    daysSinceStart = Math.floor((todayUTC.getTime() - startUTC.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  let totalDays = daysSinceStart;
  let windowStartDate = startUTC;

  if (rangeDays && rangeDays > 0) {
    // We only care about the last 'rangeDays' but capped by when the item actually started
    totalDays = Math.min(rangeDays, daysSinceStart);
    
    // Window start is (Today - rangeDays + 1)
    const windowStartTime = todayUTC.getTime() - (rangeDays - 1) * (1000 * 60 * 60 * 24);
    const calculatedWindowStart = new Date(windowStartTime);

    // If calculated window start is before the actual start date, use the actual start date
    if (calculatedWindowStart > windowStartDate) {
      windowStartDate = calculatedWindowStart;
    }
  }

  return {
    windowStartDate,
    windowEndDate: todayUTC,
    totalDays
  };
}

/**
 * Checks if a medication frequency is PRN / as-needed.
 */
export function isPRNMedication(frequency: string): boolean {
  const f = frequency.toLowerCase();
  return (
    f.includes("prn") ||
    f.includes("as needed") ||
    f.includes("as-needed") ||
    f.includes("range") ||
    f.includes("2-4 hours") ||
    f.includes("2–4 hours") ||
    f.includes("4-6 hours") ||
    f.includes("4–6 hours") ||
    f.includes("3-6 times") ||
    f.includes("3–6 times")
  );
}

/**
 * Checks if a medication category is considered a controller/maintenance medication.
 */
export function isControllerMedication(category: string): boolean {
  const c = (category || "").toLowerCase();
  return (
    c === "inhaled corticosteroid" ||
    c === "ics/laba combo" ||
    c === "biologic" ||
    c === "immunotherapy" ||
    c === "ics" ||
    c === "laba"
  );
}

/**
 * Calculates percentage and rounds to 2 decimal places.
 */
export function formatAdherencePercentage(count: number, total: number): number {
  if (total <= 0) return 0;
  const percentage = (count / total) * 100;
  return parseFloat(percentage.toFixed(2));
}

/**
 * Builds a chronological list of log statuses (Taken, Missed, or No Log) for a given number of days.
 */
export function buildChronologicalLogGrid(
  logs: { status: string; logDate: string }[],
  today: Date,
  daysCount: number = 30
): { date: string; status: "Taken" | "Missed" | "No Log" }[] {
  const grid: { date: string; status: "Taken" | "Missed" | "No Log" }[] = [];

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const dStr = d.toISOString().split("T")[0];
    const dayLogs = logs.filter(l => l.logDate === dStr);

    let status: "Taken" | "Missed" | "No Log" = "No Log";
    if (dayLogs.length > 0) {
      if (dayLogs.some(l => l.status === "taken")) {
        status = "Taken";
      } else {
        status = "Missed";
      }
    }

    grid.push({ date: dStr, status });
  }

  return grid;
}
