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
 * Calculates percentage and rounds to 2 decimal places.
 */
export function formatAdherencePercentage(count: number, total: number): number {
  if (total <= 0) return 0;
  const percentage = (count / total) * 100;
  return parseFloat(percentage.toFixed(2));
}
