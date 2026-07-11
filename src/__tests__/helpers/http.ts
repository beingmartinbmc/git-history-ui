import http from 'http';

export interface TestHttpResponse {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}

interface RequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export function request(options: RequestOptions): Promise<TestHttpResponse> {
  return requestBody(
    options,
    options.body === undefined ? undefined : JSON.stringify(options.body),
    {
      'Content-Type': 'application/json',
      ...options.headers
    }
  );
}

export function requestRaw(
  options: Omit<RequestOptions, 'body'> & { body?: string }
): Promise<TestHttpResponse> {
  return requestBody(options, options.body, options.headers);
}

export async function fetchRaw(
  url: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: string; headers: http.IncomingHttpHeaders }> {
  const response = await requestBody({ url }, undefined, headers);
  return { status: response.status, data: String(response.body ?? ''), headers: response.headers };
}

function requestBody(
  options: Pick<RequestOptions, 'url' | 'method'>,
  body: string | undefined,
  headers: Record<string, string> | undefined
): Promise<TestHttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: unknown = data;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            // Preserve non-JSON responses as strings.
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
