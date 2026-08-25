/**
 * Validates that a redirect path is safe and local.
 * Rules:
 * - Must start with '/'
 * - Must NOT start with '//'
 * - Must NOT start with '/http' (case-insensitive)
 *
 * This prevents open-redirect attacks.
 */
export function isValidRedirectPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.toLowerCase().startsWith('/http')) return false;
  return true;
}
