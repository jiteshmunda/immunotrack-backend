export const ERROR_TRANSLATIONS: Record<string, string> = {
  // --- Authentication & Session Errors ---
  "Missing or invalid authorization header": "Please sign in to access this resource.",
  "Session expired or revoked": "Your session has expired. Please log in again.",
  "Invalid or expired token": "Your session has expired. Please sign in again.",
  "Forbidden: Insufficient permissions": "Access Denied: You do not have permission to perform this action.",
  "Invalid email or password": "The email or password you entered is incorrect.",
  "Invalid or expired refresh token": "Your session has expired. Please log in again.",
  "User associated with session not found": "We couldn't find a user account associated with this session.",
  "User not found": "The requested user account was not found.",
  "Password not set. Please complete enrollment.": "Your account password is not set yet. Please complete enrollment first.",
  "Current password is incorrect": "The current password you entered is incorrect.",

  // --- Registration & Invitation Onboarding ---
  "INVALID_VERIFICATION_TOKEN": "The verification token is invalid or has expired.",
  "INVITE_NOT_FOUND_OR_ALREADY_REDEEMED": "This invitation link was not found or has already been used.",
  "INVITE_EXPIRED": "This invitation link has expired. Please request a new invitation.",
  "Please wait before requesting a new code": "Please wait a moment before requesting another verification code.",
  "Invalid request": "This request is invalid or cannot be processed.",
  "Code has expired or is invalid": "The verification code has expired or is invalid.",
  "Too many failed attempts. Please request a new code.": "Too many failed attempts. Please request a new verification code.",
  "Invalid verification code": "The verification code you entered is incorrect.",
  "New password cannot be the same as your old password": "Your new password must be different from your old password.",
  "New email cannot be the same as current email": "The new email address cannot be the same as your current email.",
  "Email is already taken": "This email address is already in use by another account.",
  "Too many failed attempts. Please wait 15 minutes before trying again.": "Too many failed attempts. Please wait 15 minutes before trying again.",
  "Password has been used recently. Please choose a new password.": "Password has been used recently. Please choose a new password.",
  "Password must be at least 12 characters for this role": "Password must be at least 12 characters for this role",

  // --- Medication Plan Modules ---
  "PATIENT_NOT_FOUND": "We couldn't find your profile. Please complete your registration.",
  "CATEGORY_AND_FREQUENCY_REQUIRED": "Please select both a category and a frequency for this medication.",
  "MEDICATION_ALREADY_EXISTS_IN_PLAN": "This medication with the same dosage and frequency is already active in your plan.",
  "MEDICATION_NOT_FOUND_OR_UNAUTHORIZED": "We couldn't find this medication in your plan, or you don't have permission to modify it.",
  
  // --- Medication Logs ---
  "MAX_DAILY_LOG_LIMIT_EXCEEDED": "You have reached the maximum number of logs allowed for this medication today.",
  "MEDICATION_LOGGED_TOO_EARLY": "This medication has been logged recently. Please wait before logging it again.",
  
  // --- Medication Reminders ---
  "REMINDERS_NOT_ALLOWED_FOR_PRN_OR_RANGE_FREQUENCIES": "Reminders cannot be scheduled for 'As needed' (PRN) medications.",
  "TIME_OR_TIMES_REQUIRED": "Please select at least one reminder time.",
  "REMINDER_ALREADY_EXISTS": "A reminder for this time and schedule is already set.",
  "REMINDER_NOT_FOUND_OR_UNAUTHORIZED": "We couldn't find this reminder, or you don't have permission to modify it.",
  
  // --- Clinicians & Access ---
  "PATIENT_ID_REQUIRED_FOR_CLINICIANS": "Please select a patient to view their adherence history.",
  "CLINICIAN_NOT_FOUND": "Your clinician profile could not be verified.",
  "UNAUTHORIZED_ACCESS_TO_PATIENT_DATA": "Access Denied: You are not assigned to this patient.",
  "Clinician ID is required": "Clinician ID is required.",
  "Clinician not found": "The requested clinician was not found.",
  "Forbidden: You do not have permission to delete this clinician": "Access Denied: You do not have permission to delete this clinician.",

  // --- File Uploads ---
  "No file uploaded": "Please select a photo to upload.",
  "Only image files are allowed!": "Only image files (JPG, PNG, WEBP) are allowed.",
  "File too large": "The uploaded file is too large. Please select an image under 5MB."
};
