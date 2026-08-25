import type { APIContext, MiddlewareNext } from 'astro';
import { defineMiddleware } from 'astro:middleware';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

function isTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const exp = payload.exp as number | undefined;
  if (exp && Date.now() / 1000 > exp) return false;
  return true;
}

function hasAdminRole(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const roles = payload.roles as Array<{ name: string; type: string }> | undefined;
  if (!Array.isArray(roles)) return false;
  return roles.some((r) => r.type === 'admin' || r.name === 'admin');
}

async function resolve(context: APIContext, next: MiddlewareNext): Promise<Response> {
  const pathname = new URL(context.request.url).pathname;

  // Public routes — always pass through
  const publicPaths = [
    '/admin/login',
    '/login',
    '/registro',
    '/registro/email-enviado',
    '/recuperar-contrasena',
    '/verify-email',
    '/reset-password',
    '/',
  ];
  const publicPrefixes = [
    '/profesionales',
    '/landings',
    '/rubros',
    '/about',
    '/contacto',
    '/privacidad',
    '/terminos',
    '/ayuda',
    '/membresia',
    '/como-funciona',
    '/_astro',
    '/favicon',
    '/uploads',
    '/assets',
  ];

  if (
    publicPaths.includes(pathname) ||
    publicPrefixes.some((p) => pathname.startsWith(p)) ||
    pathname.includes('.')
  ) {
    return next();
  }

  const token = context.cookies.get('trama_token')?.value;

  // Protect /admin/* (except /admin/login already in publicPaths)
  if (pathname.startsWith('/admin')) {
    if (!isTokenValid(token) || !hasAdminRole(token!)) {
      return context.redirect('/admin/login');
    }
    return next();
  }

  // Protect /dashboard/*
  if (pathname.startsWith('/dashboard')) {
    if (!isTokenValid(token)) {
      const from = encodeURIComponent(context.url.pathname + context.url.search);
      return context.redirect(`/login?reason=expired&from=${from}`);
    }

    // Payment gate — only for professionals
    if (token && pathname.startsWith('/dashboard')) {
      // Skip gate entirely for admins
      if (!hasAdminRole(token)) {
        // Only gate professional users
        const roles = decodeJwtPayload(token)?.roles as Array<{ name: string; type: string }> | undefined;
        const isProfessional =
          Array.isArray(roles) && roles.some((r) => r.type === 'professional' || r.name === 'professional');

        if (isProfessional) {
          try {
            const apiBase = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:3000';
            const meRes = await fetch(`${apiBase}/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(3000),
            });
            if (meRes.ok) {
              const me = await meRes.json();
              if (me?.profile?.profileStatus === 'waiting_payment') {
                // Allow /dashboard/pagos and sub-routes
                if (!pathname.startsWith('/dashboard/pagos')) {
                  return context.redirect('/dashboard/pagos');
                }
              }
            }
            // On any error (non-ok, network, timeout) → fail open, continue
          } catch {
            // fail open
          }
        }
      }
    }

    return next();
  }

  return next();
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await resolve(context, next);

  // El HTML nunca debe cachearse en el navegador: si guarda una versión vieja,
  // esta apunta a chunks JS con hash que ya no existen tras un deploy (404) y la
  // página queda rota (por ej. el login sin su script). Con `no-cache` el navegador
  // revalida y siempre recibe HTML apuntando a los assets actuales.
  // Los assets con hash (/_astro/*) no son text/html, así que conservan su cache
  // inmutable puesto por el adapter de Astro.
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    response.headers.set('Cache-Control', 'no-cache');
  }

  return response;
});
