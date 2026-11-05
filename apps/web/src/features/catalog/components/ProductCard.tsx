'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onPreview: (product: Product) => void;
  onCustomize: (product: Product) => void;
  
}

export const ProductCard = ({
  product,
  onPreview,
  onCustomize,
  
}: ProductCardProps) => {
  const canQuickAdd = product.variants.some((variant) => variant.available);
  // Ảnh không tải được (chưa có file, sai tên): hiện chữ cái đầu thay vì ảnh vỡ.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#E8DFC8] bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
      <div
        onClick={() => onPreview(product)}
        className="relative h-44 sm:h-48 w-full cursor-pointer overflow-hidden bg-[#F7F3ED]"
      >
        {imageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#F3EDE3] to-[#E8DFC8] text-5xl font-black text-[#163D2C]/40">
            {product.name.charAt(0).toUpperCase()}
          </div>
        ) : (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
        <div className="space-y-1">
          <h4
            onClick={() => onPreview(product)}
            className="cursor-pointer font-serif text-base font-bold text-[#1A1612] line-clamp-1 transition group-hover:text-[#163D2C]"
          >
            {product.name}
          </h4>
          <p className="line-clamp-1 text-xs font-medium text-[#4A3E35]">
            {product.description || 'Thơm mát · Hương vị tự nhiên'}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-extrabold text-[#1A1612]">
            {Number(product.basePrice).toLocaleString('vi-VN')} đ
          </span>
          <div className="flex items-center gap-2">
            
            <button
              type="button"
              onClick={() => onCustomize(product)}
              disabled={!canQuickAdd}
              className="flex items-center gap-1.5 rounded-full bg-[#163D2C] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1f503a] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Tùy chọn</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};