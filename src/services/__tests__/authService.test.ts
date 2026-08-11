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
  return {
    api: {
      post: vi.fn(),
      setHeader,
    },
  };
});

import { api } from '../apiClient';
import { getToken, getUserIdFromToken, isAuthenticated, login, logout, professionalRegister, restoreSession } from '../authService';

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
});
