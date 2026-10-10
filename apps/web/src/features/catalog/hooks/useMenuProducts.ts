'use client';

import { useQuery } from '@tanstack/react-query';
import { Product } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export function useMenuProducts() {
  return useQuery<Product[], Error>({
    queryKey: ['catalog', 'products'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/products`);
      if (!res.ok) {
        throw new Error(`Lỗi kết nối máy chủ (${res.status}): Không thể tải thực đơn.`);
      }

      const json = await res.json();
      return json.data;
    },
    staleTime: 1000 * 60 * 3, // Cache 3 phút
  });
}