const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export async function getPublic<T>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, options);
  if (!response.ok) throw new Error('Không thể tải danh mục xe. Vui lòng thử lại.');
  return response.json() as Promise<T>;
}

export async function submitPublic<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(result.message) ? result.message.join(', ') : result.message;
    throw new Error(typeof message === 'string' ? message : 'Không thể gửi yêu cầu. Vui lòng thử lại.');
  }
  return result as T;
}
