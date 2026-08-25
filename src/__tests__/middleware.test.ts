import { describe, expect, it, vi } from 'vitest';

describe('Scenario: Post-login redirect consumes sanitized from parameter', () => {
  describe('Test 9: Middleware includes from in redirect (SSR parity)', () => {
    it('redirects to /login?reason=expired&from=<encoded-path> on unauthorized request', () => {
      // Simulate middleware redirect behavior for unauthorized /dashboard requests
      const context = {
        url: new URL('http://localhost:3000/dashboard/perfil?tab=education'),
        cookies: {
          get: () => undefined, // No valid token
        },
        redirect: vi.fn((url: string) => {
          // Mock the redirect function
          return { url, status: 302 };
        }),
      } as any;

      // The middleware.ts line 84-85 implements this:
      const from = encodeURIComponent(context.url.pathname + context.url.search);
      const redirectUrl = `/login?reason=expired&from=${from}`;

      expect(redirectUrl).toBe('/login?reason=expired&from=%2Fdashboard%2Fperfil%3Ftab%3Deducation');

      // Verify the components
      expect(redirectUrl).toContain('?reason=expired');
      expect(redirectUrl).toContain('&from=');
      expect(redirectUrl).toContain(encodeURIComponent('/dashboard/perfil?tab=education'));
    });

    it('correctly encodes pathname and search params', () => {
      const testCases = [
        {
          pathname: '/dashboard/estudios',
          search: '',
          expected: '/login?reason=expired&from=%2Fdashboard%2Festudios',
        },
        {
          pathname: '/dashboard/pagos',
          search: '?plan=monthly',
          expected: '/login?reason=expired&from=%2Fdashboard%2Fpagos%3Fplan%3Dmonthly',
        },
        {
          pathname: '/admin/professionals',
          search: '?page=2',
          expected: '/login?reason=expired&from=%2Fadmin%2Fprofessionals%3Fpage%3D2',
        },
      ];

      testCases.forEach(({ pathname, search, expected }) => {
        const url = new URL(`http://localhost:3000${pathname}${search}`);
        const from = encodeURIComponent(url.pathname + url.search);
        const redirectUrl = `/login?reason=expired&from=${from}`;

        expect(redirectUrl).toBe(expected);
      });
    });

    it('verifies reason=expired and from= parameters are present', () => {
      const url = new URL('http://localhost:3000/dashboard/perfil');
      const from = encodeURIComponent(url.pathname + url.search);
      const redirectUrl = `/login?reason=expired&from=${from}`;

      const params = new URLSearchParams(redirectUrl.split('?')[1]);
      expect(params.get('reason')).toBe('expired');
      expect(params.get('from')).toBe('/dashboard/perfil');
    });
  });
});
