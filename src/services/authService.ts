/**
 * AuthService
 * -----------
 * Llamadas a la API de autenticacion.
 * Endpoints:
 *   - POST /auth/login  -> { email, password } => { access_token } | { error }
 */

import { clearPendingSubscription } from '../utils/subscriptionUtils';
import { api } from './apiClient';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
}

export interface LoginError {
  error: string;
}

export type JwtRole = {
  name: string;
  type: 'admin' | 'professional' | 'other';
};

export interface JwtPayload {
  sub?: string;
  email?: string;
  exp?: number;
  roles: JwtRole[];
  permissions: string[];
}

const TOKEN_KEY = 'trama_access_token';

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() >= payload.exp * 1000;
}

function normalizeJwtRole(raw: unknown): JwtRole | null {
  if (!raw || typeof raw !== 'object') return null;

  const role = raw as { name?: unknown; type?: unknown };
  if (typeof role.name !== 'string') return null;

  if (role.type === 'admin' || role.type === 'professional' || role.type === 'other') {
    return { name: role.name, type: role.type };
  }

  return { name: role.name, type: 'other' };
}

function getSafePayloadFromToken(token: string | null): JwtPayload | null {
  if (!token || isTokenExpired(token)) return null;

  const payload = parseJwtPayload(token);
  if (!payload) return null;

  const roles = Array.isArray(payload.roles)
    ? payload.roles.map(normalizeJwtRole).filter((role): role is JwtRole => role !== null)
    : [];

  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions.filter((permission): permission is string => typeof permission === 'string')
    : [];

  return {
    sub: typeof payload.sub === 'string' ? payload.sub : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    roles,
    permissions,
  };
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const data = await api.post<LoginResponse>('/auth/login', credentials);
  localStorage.setItem(TOKEN_KEY, data.access_token);
  setTokenCookie(data.access_token);
  api.setHeader('Authorization', `Bearer ${data.access_token}`);
  return data;
}

export async function adminLogin(credentials: LoginRequest): Promise<LoginResponse> {
  const data = await api.post<LoginResponse>('/auth/admin/login', credentials);
  localStorage.setItem(TOKEN_KEY, data.access_token);
  setTokenCookie(data.access_token);
  api.setHeader('Authorization', `Bearer ${data.access_token}`);
  return data;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired(token)) {
    localStorage.removeItem(TOKEN_KEY);
    clearTokenCookie();
    return false;
  }
  return true;
}

export async function logout(redirectTo = '/login'): Promise<void> {
  try {
    clearPendingSubscription();
  } catch (err) {
    console.error('[logout] clearPendingSubscription failed:', err);
  }
  localStorage.removeItem(TOKEN_KEY);
  clearTokenCookie();
  window.location.href = redirectTo;
}

export function getUserIdFromToken(): string | null {
  const payload = getSafePayloadFromToken(getToken());
  if (!payload?.sub) return null;
  return payload.sub;
}

export function getEmailFromToken(): string | null {
  const payload = getSafePayloadFromToken(getToken());
  if (!payload?.email) return null;
  return payload.email;
}

export function getRolesFromToken(): JwtRole[] {
  const payload = getSafePayloadFromToken(getToken());
  return payload?.roles ?? [];
}

export function getPermissionsFromToken(): string[] {
  const payload = getSafePayloadFromToken(getToken());
  return payload?.permissions ?? [];
}

export function isAdmin(): boolean {
  try {
    const roles = getRolesFromToken();
    return roles.some((role) => role.type === 'admin' || role.name === 'admin');
  } catch {
    return false;
  }
}

export function isProfessional(): boolean {
  try {
    const roles = getRolesFromToken();
    return roles.some((role) => role.type === 'professional' || role.name === 'professional');
  } catch {
    return false;
  }
}

/** @deprecated Use getRolesFromToken() or isAdmin()/isProfessional(). */
export function getRoleFromToken(): string {
  return getRolesFromToken()[0]?.name ?? '';
}

export function restoreSession(): void {
  // Wire the global 401 handler on every session restore.
  // restoreSession() is called synchronously at module-top in every
  // authenticated page script, before any API calls — making it the
  // only boot point that reliably precedes the first request across
  // both DashboardLayout and AdminLayout page trees.
  api.setUnauthorizedHandler(() => logout(`/login?reason=expired&from=${encodeURIComponent(window.location.pathname + window.location.search)}`));

  const token = getToken();
  if (token && !isTokenExpired(token)) {
    api.setHeader('Authorization', `Bearer ${token}`);
  } else if (token) {
    localStorage.removeItem(TOKEN_KEY);
    clearTokenCookie();
  }
}

// ─── Professional Register ─────────────────────────────────────

export interface ProfessionalRegisterRequest {
  email: string;
  password: string;
  name: string;
  city?: string;
  rubroId?: number;
  whatsapp?: string;
  countryId?: number;
  provinceId?: number;
}

export interface RegisterResponse {
  access_token: string;
  userId: string;
}

type ApiError = Error & {
  status?: number;
  body?: unknown;
};

export async function professionalRegister(
  data: ProfessionalRegisterRequest,
): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>('/auth/professional-register', data);
  return res;
}

export function setTokenCookie(token: string): void {
  if (typeof document === 'undefined') return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const maxAgeEnv = parseInt(import.meta.env.PUBLIC_SESSION_MAX_AGE_SECONDS || '', 10);
  const maxAge = Number.isNaN(maxAgeEnv) || maxAgeEnv <= 0 ? 82800 : maxAgeEnv;
  document.cookie = `trama_token=${encodeURIComponent(token)}; path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearTokenCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'trama_token=; path=/; Max-Age=0; SameSite=Lax';
}

export interface ReferralCodeResponse {
  referralCode: string | null;
}

function setReferralAuthHeader(): void {
  const token = getToken();
  if (token) {
    api.setHeader('Authorization', `Bearer ${token}`);
  }
}

export async function getReferralCode(): Promise<ReferralCodeResponse> {
  setReferralAuthHeader();
  return api.get<ReferralCodeResponse>('/auth/me/referral-code');
}

export async function updateReferralCode(referralCode: string): Promise<ReferralCodeResponse> {
  setReferralAuthHeader();
  try {
    return await api.patch<ReferralCodeResponse>('/auth/me/referral-code', { referralCode });
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.status === 409 && apiError.body && typeof apiError.body === 'object') {
      const body = apiError.body as { message?: unknown };
      if (typeof body.message === 'string') {
        throw new Error(body.message);
      }
    }
    throw error;
  }
}

// ─── Password Recovery ─────────────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email });
}

export async function resetPassword(
  userId: string,
  token: string,
  newPassword: string,
): Promise<void> {
  await api.post('/auth/reset-password', { userId, token, newPassword });
}

// ─── Email Verification ────────────────────────────────────────

export interface VerifyEmailResponse {
  message: string;
}

/** Marca el email como verificado. El token (JWT) viaja en el query, sin auth. */
export async function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return api.get<VerifyEmailResponse>('/auth/verify-email', { token });
}

/** Reenvía el email de verificación (público, rate-limited). */
export async function resendVerification(email: string): Promise<void> {
  await api.post('/auth/resend-verification', { email });
}

export async function changePasswordDashboard(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  const token = getToken();
  if (token) {
    api.setHeader('Authorization', `Bearer ${token}`);
  }

  await api.patch<void>('/auth/me/password', { currentPassword, newPassword, confirmPassword });
}

export async function changePasswordAdmin(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  const token = getToken();
  if (token) {
    api.setHeader('Authorization', `Bearer ${token}`);
  }

  await api.patch<void>('/auth/change-password', { currentPassword, newPassword, confirmPassword });
}
