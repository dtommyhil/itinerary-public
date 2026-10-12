export async function requestJson<T>(
  url: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? 'Unable to complete this request');
  return result as T;
}
export function requestError(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unable to connect. Please try again.';
}
