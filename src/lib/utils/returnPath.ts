/**
 * Where to go after signing in (multi-league step 3): an invite link `/join/{code}` opened while signed out
 * comes back after the login / sign-up (also after confirming the email). Only `/join/…` paths are kept.
 */
const KEY = 'cc_return_to';
const ALLOWED = /^\/join\/[A-Za-z0-9_-]{6,64}$/;

export function setReturnPath(path: string) {
  if (!ALLOWED.test(path)) return;
  try {
    localStorage.setItem(KEY, path);
  } catch {
    /* storage not available */
  }
}

/**
 * The saved path, or '/'. NOT removed here (sign-in redirects from two places): the invite page clears it
 * with `clearReturnPath()` once it is open.
 */
export function takeReturnPath(): string {
  try {
    const p = localStorage.getItem(KEY);
    return p && ALLOWED.test(p) ? p : '/';
  } catch {
    return '/';
  }
}

export function clearReturnPath() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage not available */
  }
}
