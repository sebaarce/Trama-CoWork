const PENDING_SUBSCRIPTION_KEY = 'trama_subscription_pending';

/**
 * Removes the pending subscription marker from localStorage.
 * Call unconditionally on logout or after a payment flow concludes.
 * Safe to call when no pending subscription exists (no-op).
 */
export function clearPendingSubscription(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(PENDING_SUBSCRIPTION_KEY);
}
