/**
 * @description Creates compact local identifiers for documents and snapshots.
 */
export function createId(prefix = "doc") {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${random.replaceAll("-", "").slice(0, 18)}`;
}
