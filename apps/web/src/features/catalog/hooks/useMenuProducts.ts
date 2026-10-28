
'use client';

import { useQuery } from '@tanstack/react-query';
import type { Product } from '../types';
import { fetchMenuProducts } from '../api';

export function useMenuProducts() {
  return useQuery<Product[], Error>({
    queryKey: ['catalog', 'products'],
    queryFn: () => fetchMenuProducts(),
    staleTime: 1000 * 60 * 3,
  });
}
