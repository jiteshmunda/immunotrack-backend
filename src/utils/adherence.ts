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
  const today = new Date(targetDate);
  today.setHours(0, 0, 0, 0);

  const start = new Date(itemStartDate);
  start.setHours(0, 0, 0, 0);

  // Total days since start (inclusive)
  const diffTimeSinceStart = today.getTime() - start.getTime();
  let daysSinceStart = Math.floor(diffTimeSinceStart / (1000 * 60 * 60 * 24)) + 1;
  if (daysSinceStart < 0) daysSinceStart = 0;

  let totalDays = daysSinceStart;
  let windowStartDate = start;

  if (rangeDays && rangeDays > 0) {
    // We only care about the last 'rangeDays' but capped by when the item actually started
    totalDays = Math.min(rangeDays, daysSinceStart);
    
    // Window start is (Today - rangeDays + 1)
    const windowStartTime = today.getTime() - (rangeDays - 1) * (1000 * 60 * 60 * 24);
    const calculatedWindowStart = new Date(windowStartTime);
    calculatedWindowStart.setHours(0, 0, 0, 0);

    // If calculated window start is before the actual start date, use the actual start date
    if (calculatedWindowStart > windowStartDate) {
      windowStartDate = calculatedWindowStart;
    }
  }

  return {
    windowStartDate,
    windowEndDate: today,
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
