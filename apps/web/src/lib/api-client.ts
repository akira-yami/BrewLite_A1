export async function authenticatedRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    // Lấy token từ cơ sở hạ tầng của frontend (ví dụ: localStorage cho Client-side component)
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

    const headers = new Headers(options.headers);

    // Mặc định ép kiểu JSON trừ khi bị ghi đè
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}