/** Shared limits for forms and server writes. Never silently truncate clinical information. */
export function textValue(value: unknown, label: string, max = 400, required = false): string {
  if (value != null && typeof value !== "string") throw new Error(`${label} must be text`);
  const text = (value ?? "").toString().trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error(`${label} contains invalid characters`);
  return text;
}

export const PHONE_PATTERN = String.raw`\+?[0-9 \(\)\-]{7,25}`;
export function phoneValue(value: unknown, label = "Phone"): string {
  const phone = textValue(value, label, 25);
  if (phone && (!/^\+?[0-9 ()-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15)) {
    throw new Error(`${label} must contain 7–15 digits, with an optional country code`);
  }
  return phone;
}

export function uuidValue(value: unknown, label = "Record"): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(`Choose a valid ${label.toLowerCase()}`);
  return value;
}

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const PROFILE_LIMITS = { full_name: 200, phone: 25, blood_type: 3, allergies: 2000, medical_conditions: 2000, medications: 2000, emergency_contact_name: 200, emergency_contact_phone: 25 };
export function validateProfile<T extends Record<keyof typeof PROFILE_LIMITS, string>>(profile: T): T {
  const result = { ...profile };
  for (const key of Object.keys(PROFILE_LIMITS) as (keyof typeof PROFILE_LIMITS)[]) {
    result[key] = textValue(profile[key], key.replace(/_/g, " "), PROFILE_LIMITS[key]) as T[typeof key];
  }
  result.phone = phoneValue(result.phone) as T["phone"];
  result.emergency_contact_phone = phoneValue(result.emergency_contact_phone, "Emergency contact phone") as T["emergency_contact_phone"];
  if (result.blood_type && !BLOOD_TYPES.includes(result.blood_type)) throw new Error("Choose a valid blood type or leave it unknown");
  return result;
}
