
import type { Product } from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

/**
 * Lấy danh sách sản phẩm từ API.
 * fetchImpl được truyền vào để có thể kiểm thử mà không cần chạy backend.
 */
export async function fetchMenuProducts(
  fetchImpl: typeof fetch = fetch,
): Promise<Product[]> {
  const response = await fetchImpl(`${API_BASE_URL}/products`);

  if (!response.ok) {
    throw new Error(
      `Lỗi kết nối máy chủ (${response.status}): Không thể tải thực đơn.`,
    );
  }

  const json = await response.json();

  return json.data;
}
