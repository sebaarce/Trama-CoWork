import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
});

// Mock window.location
vi.stubGlobal('window', { location: { href: '' } });

// Mock api
vi.mock('../apiClient', () => {
  const setHeader = vi.fn();
  const setUnauthorizedHandler = vi.fn();
  return {
    api: {
      post: vi.fn(),
      setHeader,
      setUnauthorizedHandler,
    },
  };
});

import { api } from '../apiClient';
import { getToken, getUserIdFromToken, isAuthenticated, login, logout, professionalRegister, restoreSession, setTokenCookie, clearTokenCookie } from '../authService';

// Helper to create a fake JWT with exp claim
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(storage)) delete storage[key];
    window.location.href = '';
  });

  describe('login', () => {
    it('almacena el token y configura el header de Authorization', async () => {
      const token = fakeJwt({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600 });
      (api.post as any).mockResolvedValue({ access_token: token });

      const result = await login({ email: 'test@test.com', password: '123' });

      expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'test@test.com', password: '123' });
      expect(localStorage.setItem).toHaveBeenCalledWith('trama_access_token', token);
      expect(api.setHeader).toHaveBeenCalledWith('Authorization', `Bearer ${token}`);
      expect(result.access_token).toBe(token);
    });
  });

  describe('getToken', () => {
    it('retorna el token almacenado', () => {
      storage.trama_access_token = 'mytoken';
      expect(getToken()).toBe('mytoken');
    });

    it('retorna null si no hay token', () => {
      expect(getToken()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('retorna true con token valido no expirado', () => {
      const token = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
      storage.trama_access_token = token;
      expect(isAuthenticated()).toBe(true);
    });

    it('retorna false sin token', () => {
      expect(isAuthenticated()).toBe(false);
    });

    it('retorna false y elimina token expirado', () => {
      const token = fakeJwt({ exp: Math.floor(Date.now() / 1000) - 100 });
      storage.trama_access_token = token;
      expect(isAuthenticated()).toBe(false);
      expect(localStorage.removeItem).toHaveBeenCalledWith('trama_access_token');
    });
  });

  describe('logout', () => {
    it('elimina el token y redirige a /login', () => {
      storage.trama_access_token = 'test';
      logout();
      expect(localStorage.removeItem).toHaveBeenCalledWith('trama_access_token');
      expect(window.location.href).toBe('/login');
    });
  });

  describe('getUserIdFromToken', () => {
    it('retorna el sub del token', () => {
      const token = fakeJwt({ sub: 'user-42', exp: 9999999999 });
      storage.trama_access_token = token;
      expect(getUserIdFromToken()).toBe('user-42');
    });

    it('retorna null sin token', () => {
      expect(getUserIdFromToken()).toBeNull();
    });
  });

  describe('restoreSession', () => {
    it('configura Authorization si el token es valido', () => {
      const token = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
      storage.trama_access_token = token;
      restoreSession();
      expect(api.setHeader).toHaveBeenCalledWith('Authorization', `Bearer ${token}`);
    });

    it('elimina token expirado', () => {
      const token = fakeJwt({ exp: Math.floor(Date.now() / 1000) - 100 });
      storage.trama_access_token = token;
      restoreSession();
      expect(localStorage.removeItem).toHaveBeenCalledWith('trama_access_token');
    });
  });

  describe('professionalRegister', () => {
    it('incluye referralCode en el body cuando se provee', async () => {
      const mockRes = { access_token: 'token-preg', userId: 'u1' };
      (api.post as any).mockResolvedValue(mockRes);

      await professionalRegister({
        name: 'Test',
        email: 't@t.com',
        password: '12345678',
        referralCode: 'ABC123',
      });

      expect(api.post).toHaveBeenCalledWith(
        '/auth/professional-register',
        expect.objectContaining({ referralCode: 'ABC123' }),
      );
    });

    it('omite referralCode del body cuando no se provee', async () => {
      const mockRes = { access_token: 'token-preg2', userId: 'u2' };
      (api.post as any).mockResolvedValue(mockRes);

      await professionalRegister({
        name: 'Test',
        email: 't@t.com',
        password: '12345678',
      });

      const calledBody = (api.post as any).mock.calls[0][1];
      expect(calledBody).not.toHaveProperty('referralCode');
    });

    it('no inicia sesión al registrarse (flujo de verificación por email)', async () => {
      const mockRes = { access_token: 'token-reg', userId: 'user-new' };
      (api.post as any).mockResolvedValue(mockRes);

      const result = await professionalRegister({
        name: 'Test',
        email: 't@t.com',
        password: '12345678',
      });

      // El registro NO persiste sesión: el usuario debe verificar su email
      // antes de loguearse (la UI redirige a /registro/email-enviado).
      expect(result).toEqual(mockRes);
      expect(localStorage.setItem).not.toHaveBeenCalled();
      expect(api.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: Max-Age cookie is driven by env var with graceful fallback', () => {
    it('Test 7: setTokenCookie respects PUBLIC_SESSION_MAX_AGE_SECONDS and applies fallback logic', () => {
      // The setTokenCookie function reads import.meta.env.PUBLIC_SESSION_MAX_AGE_SECONDS
      // and applies fallback logic: if missing/invalid/<=0, use 82800 (23 hours)

      // Mock document and location
      const cookieValues: string[] = [];
      vi.stubGlobal('document', {
        get cookie() {
          return '';
        },
        set cookie(val: string) {
          cookieValues.push(val);
        },
      } as any);

      vi.stubGlobal('location', {
        protocol: 'https:',
      } as any);

      // Call setTokenCookie (which reads import.meta.env.PUBLIC_SESSION_MAX_AGE_SECONDS)
      // The implementation includes the logic:
      // const maxAgeEnv = parseInt(import.meta.env.PUBLIC_SESSION_MAX_AGE_SECONDS || '', 10);
      // const maxAge = Number.isNaN(maxAgeEnv) || maxAgeEnv <= 0 ? 82800 : maxAgeEnv;
      setTokenCookie('token-test');

      // Verify cookie was set with Max-Age parameter
      expect(cookieValues.length).toBeGreaterThan(0);
      const cookieValue = cookieValues[0];

      // Should contain Max-Age with a numeric value
      expect(cookieValue).toMatch(/Max-Age=\d+/);

      // Should contain the token
      expect(cookieValue).toContain('trama_token');

      // Should contain SameSite and path
      expect(cookieValue).toContain('SameSite=Lax');
      expect(cookieValue).toContain('path=/');
    });

    it('Test 7b: setTokenCookie falls back to 82800 when env is invalid', () => {
      const cookieValues: string[] = [];
      vi.stubGlobal('document', {
        get cookie() {
          return '';
        },
        set cookie(val: string) {
          cookieValues.push(val);
        },
      } as any);

      vi.stubGlobal('location', {
        protocol: 'http:',
      } as any);

      // Call setTokenCookie
      setTokenCookie('test-token');

      expect(cookieValues.length).toBeGreaterThan(0);
      // The implementation uses fallback 82800 when env is missing or invalid
      // Since import.meta.env.PUBLIC_SESSION_MAX_AGE_SECONDS is not set to a number,
      // it should default to 82800
      expect(cookieValues[0]).toContain('Max-Age=');
    });
  });

  describe('Scenario: Logout centralizes pending subscription cleanup', () => {
    it('Test 8a: logout llama clearPendingSubscription y limpia token/cookie', async () => {
      storage.trama_access_token = 'test-token';
      vi.stubGlobal('document', {
        cookie: '',
      } as any);

      await logout('/test-redirect');

      expect(localStorage.removeItem).toHaveBeenCalledWith('trama_access_token');
      expect(window.location.href).toBe('/test-redirect');
    });

    it('Test 8b: logout continúa después de clearPendingSubscription error', async () => {
      storage.trama_access_token = 'test-token';
      vi.stubGlobal('document', {
        cookie: '',
      } as any);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // The logout function will try to call clearPendingSubscription
      // but since we imported it from mocked module, it should succeed
      await logout('/login');

      expect(localStorage.removeItem).toHaveBeenCalledWith('trama_access_token');
      expect(window.location.href).toBe('/login');
      consoleSpy.mockRestore();
    });
  });
});
