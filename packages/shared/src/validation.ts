/**
 * Input validation for path safety (reject .. and / in ids)
 * @see user rules: 外部输入安全
 */

const UNSAFE_PATTERN = /\.\.|\//;

/**
 * Validates id/name for use in file paths. Rejects values containing .. or /
 */
export function validateSafeId(value: string, fieldName = "id"): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  if (UNSAFE_PATTERN.test(value)) {
    throw new Error(`${fieldName} contains invalid characters`);
  }
}

/**
 * Returns true if value is safe for path usage
 */
export function isSafeId(value: string): boolean {
  return typeof value === "string" && value.length > 0 && !UNSAFE_PATTERN.test(value);
}
