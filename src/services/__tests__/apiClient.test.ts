import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../apiClient';

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: { PUBLIC_API_BASE_URL: 'http://localhost:3000' } } });

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3000');
    vi.restoreAllMocks();
  });

  it('construye URLs correctamente con query params', async () => {
    const mockResponse = { data: 'test' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    await client.get('/professionals', { page: 1, sizePage: 10 });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/professionals?page=1&sizePage=10',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('omite query params con valor undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    await client.get('/test', { a: 'yes', b: undefined });

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/test?a=yes', expect.any(Object));
  });

  it('envia body en POST como JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      }),
    );

    await client.post('/auth/login', { email: 'a@b.com', password: '123' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: '123' }),
      }),
    );
  });

  it('lanza error con status y body cuando la respuesta no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      }),
    );

    try {
      await client.get('/protected');
      expect.unreachable('Deberia haber lanzado un error');
    } catch (err: any) {
      expect(err.message).toContain('401');
      expect(err.status).toBe(401);
      expect(err.body).toEqual({ error: 'Invalid credentials' });
    }
  });

  it('maneja error de parseo en respuesta no-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('invalid json')),
      }),
    );

    try {
      await client.get('/broken');
      expect.unreachable('Deberia haber lanzado un error');
    } catch (err: any) {
      expect(err.status).toBe(500);
      expect(err.body).toBeNull();
    }
  });

  it('elimina trailing slashes de la baseUrl', () => {
    const c = new ApiClient('http://example.com///');
    // Verify internal state via a request
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );
    c.get('/test');
    expect(fetch).toHaveBeenCalledWith('http://example.com/test', expect.any(Object));
  });

  it('setHeader agrega headers personalizados', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    client.setHeader('Authorization', 'Bearer token123');
    await client.get('/me');

    const callArgs = (fetch as any).mock.calls[0];
    expect(callArgs[1].headers).toEqual(expect.objectContaining({ Authorization: 'Bearer token123' }));
  });

  it('PUT envia body correctamente', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    await client.put('/profile', { name: 'Test' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/profile',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      }),
    );
  });

  it('DELETE no envia body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    await client.del('/item/1');

    const callArgs = (fetch as any).mock.calls[0];
    expect(callArgs[1].method).toBe('DELETE');
    expect(callArgs[1].body).toBeUndefined();
  });

  it('tolera respuesta 200 con body vacio (no rompe con JSON invalido)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
      }),
    );

    await expect(client.del('/notifications/preferences/mi-canal/channel')).resolves.toBeUndefined();
  });

  it('devuelve undefined en respuesta 204 sin intentar parsear', async () => {
    const json = vi.fn(() => Promise.reject(new Error('no deberia llamarse')));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json,
      }),
    );

    await expect(client.del('/item/1')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });
});

describe('Scenario: Global 401 interceptor triggers logout and redirects to login', () => {
  it('Test 1: Interceptor invoca handler en 401 y relanza el error', async () => {
    const mockHandler = vi.fn();
    const client = new ApiClient('http://localhost:3000');
    client.setUnauthorizedHandler(mockHandler);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Token expired' }),
      }),
    );

    try {
      await client.get('/protected');
      expect.unreachable('Debería haber lanzado error 401');
    } catch (err: any) {
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(err.status).toBe(401);
    }
  });

  it('Test 3: Upload method intercepta 401 y relanza', async () => {
    const mockHandler = vi.fn();
    const client = new ApiClient('http://localhost:3000');
    client.setUnauthorizedHandler(mockHandler);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Unauthorized upload' }),
      }),
    );

    const formData = new FormData();
    formData.append('file', new Blob(['test']), 'test.txt');

    try {
      await client.upload('/uploads/file', formData);
      expect.unreachable('Debería haber lanzado error 401');
    } catch (err: any) {
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(err.status).toBe(401);
    }
  });
});

describe('Scenario: Login endpoint 401 responses do not trigger interceptor', () => {
  it('Test 2: Interceptor NO invoca handler para /auth/login con 401', async () => {
    const mockHandler = vi.fn();
    const client = new ApiClient('http://localhost:3000');
    client.setUnauthorizedHandler(mockHandler);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      }),
    );

    try {
      await client.post('/auth/login', { email: 'test@test.com', password: 'wrong' });
      expect.unreachable('Debería haber lanzado error 401');
    } catch (err: any) {
      expect(mockHandler).not.toHaveBeenCalled();
      expect(err.status).toBe(401);
    }
  });

  it('Test 2b: Interceptor NO invoca handler para /auth/admin/login con 401', async () => {
    const mockHandler = vi.fn();
    const client = new ApiClient('http://localhost:3000');
    client.setUnauthorizedHandler(mockHandler);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      }),
    );

    try {
      await client.post('/auth/admin/login', { email: 'admin@test.com', password: 'wrong' });
      expect.unreachable('Debería haber lanzado error 401');
    } catch (err: any) {
      expect(mockHandler).not.toHaveBeenCalled();
      expect(err.status).toBe(401);
    }
  });
});

describe('Scenario: Document downloads via apiClient preserve interceptor coverage', () => {
  it('Test 5: downloadBlob retorna Blob en success (2xx)', async () => {
    const blobData = new Blob(['test document'], { type: 'application/pdf' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(blobData),
      }),
    );

    const client = new ApiClient('http://localhost:3000');
    const result = await client.downloadBlob('/uploads/document/123');

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('application/pdf');
  });

  it('Test 6: downloadBlob invoca handler en 401 y relanza', async () => {
    const mockHandler = vi.fn();
    const client = new ApiClient('http://localhost:3000');
    client.setUnauthorizedHandler(mockHandler);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      }),
    );

    try {
      await client.downloadBlob('/uploads/document/secure');
      expect.unreachable('Debería haber lanzado error 401');
    } catch (err: any) {
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(err.status).toBe(401);
    }
  });
});
