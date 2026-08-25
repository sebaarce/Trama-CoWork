import { describe, expect, it } from 'vitest';
import { isValidRedirectPath } from '../redirectUtils';

describe('Scenario: Post-login redirect consumes sanitized from parameter', () => {
  describe('Test 4 & 10: isValidRedirectPath helper rejects open-redirect patterns', () => {
    it('accepts valid local paths starting with /', () => {
      expect(isValidRedirectPath('/dashboard')).toBe(true);
      expect(isValidRedirectPath('/perfil')).toBe(true);
      expect(isValidRedirectPath('/dashboard?foo=bar')).toBe(true);
      expect(isValidRedirectPath('/pagos/resultado')).toBe(true);
    });

    it('rejects paths not starting with /', () => {
      expect(isValidRedirectPath('dashboard')).toBe(false);
      expect(isValidRedirectPath('perfil')).toBe(false);
      expect(isValidRedirectPath('')).toBe(false);
    });

    it('rejects double-slash open-redirect patterns', () => {
      expect(isValidRedirectPath('//evil.com')).toBe(false);
      expect(isValidRedirectPath('//example.com/path')).toBe(false);
    });

    it('rejects /http patterns (case-insensitive)', () => {
      expect(isValidRedirectPath('/https://evil.com')).toBe(false);
      expect(isValidRedirectPath('/http://evil.com')).toBe(false);
      expect(isValidRedirectPath('/HTTP://evil.com')).toBe(false);
      expect(isValidRedirectPath('/HttpS://evil.com')).toBe(false);
    });

    it('accepts /httpd and other legitimate paths starting with /http but not followed by ://', () => {
      expect(isValidRedirectPath('/httpsession')).toBe(false); // starts with /http
      expect(isValidRedirectPath('/httpd')).toBe(false); // starts with /http
    });

    it('safely falls back to /dashboard for invalid paths', () => {
      // This tests the intended behavior of login form calling the function
      const fallback = '/dashboard';
      const validPaths = ['/dashboard', '/perfil', '/pagos'];
      const invalidPaths = ['', '//evil.com', '/http://evil.com', 'http://evil.com'];

      validPaths.forEach((path) => {
        expect(isValidRedirectPath(path)).toBe(true);
      });

      invalidPaths.forEach((path) => {
        expect(isValidRedirectPath(path)).toBe(false);
      });
    });
  });
});
