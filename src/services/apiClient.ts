/**
 * ApiClient
 * ---------
 * Clase base HTTP para todos los servicios.
 * Centraliza la URL base, headers y metodos GET / POST / PUT / DELETE.
 *
 * Uso:
 *   Los servicios concretos extienden o consumen esta clase
 *   pasando solo el path y parametros necesarios.
 */

export interface QueryParams {
  [key: string]: string | number | boolean | undefined;
}

const API_BASE_URL = (import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export function apiURL(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

export const INTERCEPTOR_EXCLUDED_PATHS: readonly string[] = ['/auth/login', '/auth/admin/login'];

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private unauthorizedHandler?: () => void;

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const isAbsoluteUrl = /^https?:\/\//i.test(path);
    const url = isAbsoluteUrl ? new URL(path) : new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    options?: { query?: QueryParams; body?: unknown },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.query);

    const config: RequestInit = {
      method,
      headers: { ...this.defaultHeaders },
    };

    if (options?.body && method !== 'GET') {
      config.body = JSON.stringify(options.body);
    }

    try {
      console.log(`[API] ${method} ${url}`);
      const res = await fetch(url, config);

      if (!res.ok) {
        let errorBody: unknown;
        try {
          errorBody = await res.json();
        } catch {
          errorBody = null;
        }
        const err = new Error(`[${method}] ${path} - ${res.status} ${res.statusText}`) as Error & {
          status: number;
          body: unknown;
        };
        err.status = res.status;
        err.body = errorBody;
        throw err;
      }

      return this.parseBody<T>(res);
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401 && !INTERCEPTOR_EXCLUDED_PATHS.includes(path)) {
        this.unauthorizedHandler?.();
      }
      throw err;
    }
  }

  /**
   * Parsea el body de una respuesta exitosa tolerando cuerpos vacios.
   * Un 204 o un 200 sin body (tipico de DELETE) devuelve undefined en vez
   * de romper con "Unexpected end of JSON input".
   */
  private async parseBody<T>(res: Response): Promise<T> {
    if (res.status === 204) {
      return undefined as T;
    }
    try {
      return (await res.json()) as T;
    } catch {
      return undefined as T;
    }
  }

  async get<T>(path: string, query?: QueryParams): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  async post<T>(path: string, body?: unknown, query?: QueryParams): Promise<T> {
    return this.request<T>('POST', path, { body, query });
  }

  async put<T>(path: string, body?: unknown, query?: QueryParams): Promise<T> {
    return this.request<T>('PUT', path, { body, query });
  }

  async patch<T>(path: string, body?: unknown, query?: QueryParams): Promise<T> {
    return this.request<T>('PATCH', path, { body, query });
  }

  async del<T>(path: string, query?: QueryParams): Promise<T> {
    return this.request<T>('DELETE', path, { query });
  }

  /**
   * Upload a file via multipart/form-data.
   * Does NOT set Content-Type — the browser adds the boundary automatically.
   */
  async upload<T>(path: string, formData: FormData): Promise<T> {
    const url = this.buildUrl(path);

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.defaultHeaders)) {
      if (k.toLowerCase() !== 'content-type') headers[k] = v;
    }

    try {
      console.log(`[API] POST (upload) ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        let errorBody: unknown;
        try {
          errorBody = await res.json();
        } catch {
          errorBody = null;
        }
        const err = new Error(`[POST upload] ${path} - ${res.status} ${res.statusText}`) as Error & {
          status: number;
          body: unknown;
        };
        err.status = res.status;
        err.body = errorBody;
        throw err;
      }

      return this.parseBody<T>(res);
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401 && !INTERCEPTOR_EXCLUDED_PATHS.includes(path)) {
        this.unauthorizedHandler?.();
      }
      throw err;
    }
  }

  /** Build a full URL for binary downloads (caller uses window.open or <a>). */
  downloadUrl(path: string): string {
    return this.buildUrl(path);
  }

  /**
   * Download a binary resource and return it as a Blob.
   * Covered by the global 401 interceptor: 401 responses invoke the
   * unauthorized handler and re-throw, same as request().
   */
  async downloadBlob(path: string): Promise<Blob> {
    const url = this.buildUrl(path);
    const config: RequestInit = {
      method: 'GET',
      headers: { ...this.defaultHeaders, 'Content-Type': 'application/octet-stream' },
    };

    try {
      console.log(`[API] GET (blob) ${url}`);
      const res = await fetch(url, config);

      if (!res.ok) {
        const err = new Error(`[GET blob] ${path} - ${res.status} ${res.statusText}`) as Error & {
          status: number;
        };
        err.status = res.status;
        throw err;
      }

      return res.blob();
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401 && !INTERCEPTOR_EXCLUDED_PATHS.includes(path)) {
        this.unauthorizedHandler?.();
      }
      throw err;
    }
  }

  setUnauthorizedHandler(fn: () => void): void {
    this.unauthorizedHandler = fn;
  }

  setHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value;
  }
}

export const api = new ApiClient();

// Traceability: implementation by Programmer at 2026-06-22 09:33:21
