/**
 * Normalizes a raw composite score to a 0–10 scale based on the clinical domain.
 * @param category - The clinical domain (respiratory, nasal, or skin)
 * @param score - The raw composite score
 */
export function normalizeScore(category: "respiratory" | "nasal" | "skin", score: number): number {
  let max = 1;
  if (category === "respiratory") max = 6;
  if (category === "nasal") max = 40;
  if (category === "skin") max = 28;
  return parseFloat(((score / max) * 10).toFixed(1));
}

/**
 * Calculates the overall risk score (0-10) based on three clinical domains.
 */
export function calculateRiskScore(respiratory: number, nasal: number, skin: number): number {
  const normResp = normalizeScore("respiratory", respiratory);
  const normNasal = normalizeScore("nasal", nasal);
  const normSkin = normalizeScore("skin", skin);
  return parseFloat(((normResp + normNasal + normSkin) / 3).toFixed(1));
}

/**
 * Returns the clinical severity level/band based on the risk score.
 */
export function getSeverityLevel(score: number): "Low" | "Moderate" | "High" {
  if (score < 4) return "Low";
  if (score < 7) return "Moderate";
  return "High";
}

/**
 * Returns the status color based on the domain-specific raw score.
 */
export function getStatusColor(category: "respiratory" | "nasal" | "skin", score: number): "green" | "amber" | "red" {
  if (category === "respiratory") {
    if (score <= 0.75) return "green";
    if (score <= 1.50) return "amber";
    return "red";
  }
  if (category === "nasal") {
    if (score <= 9) return "green";
    if (score <= 21) return "amber";
    return "red";
  }
  if (category === "skin") {
    if (score <= 7) return "green";
    if (score <= 16) return "amber";
    return "red";
  }
  return "green";
}
