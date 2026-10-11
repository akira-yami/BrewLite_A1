'use client';

import Image from 'next/image';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onPreview: (product: Product) => void;
  onCustomize: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
}

export const ProductCard = ({ product, onPreview, onCustomize, onQuickAdd }: ProductCardProps) => {
  return (
    <div className="group flex flex-col justify-between rounded-2xl border border-[#E5DCD2] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#c9bcaf] hover:shadow-xl">
      <div>
        <div
          onClick={() => onPreview(product)}
          className="relative h-52 w-full cursor-pointer overflow-hidden rounded-t-2xl"
        >
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          <span className="absolute left-3 top-3 rounded-full border border-amber-500/30 bg-black/60 px-3 py-1 text-[10px] font-extrabold text-[#fcd34d] backdrop-blur-md">
            {product.sku}
          </span>
        </div>

        <div className="space-y-3 p-5">
          <h4
            onClick={() => onPreview(product)}
            className="cursor-pointer text-lg font-black leading-snug text-[#1E1813] transition hover:text-[#163E2B]"
          >
            {product.name}
          </h4>
          <p className="line-clamp-2 text-xs leading-relaxed text-[#756A63]">
            {product.description || 'Thức uống được chiết xuất tươi mới giữ trọn hương vị tại quầy Barista BrewLite.'}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-3 border-t border-[#FAF6F2] p-5 pt-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="block text-[10px] font-semibold uppercase text-[#756A63]">Giá từ</span>
          <span className="font-mono text-lg font-black text-[#163E2B]">
            {product.basePrice.toLocaleString('vi-VN')} đ
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onQuickAdd(product)}
            className="flex items-center space-x-1 rounded-xl border border-[#E5DCD2] bg-[#FAF6F2] px-3 py-2 text-xs font-bold text-[#163E2B] transition hover:bg-[#E8F1EC]"
          >
            + Thêm
          </button>
          <button
            onClick={() => onCustomize(product)}
            className="rounded-xl bg-[#163E2B] px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-[#1f4f38] hover:shadow-lg active:scale-95"
          >
            Tùy Biến
          </button>
        </div>
      </div>
    </div>
  );
};
