'use client';

import Image from 'next/image';
import { Product } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onOpenCustomizer: (product: Product) => void;
}

export const ProductDetailModal = ({
  product,
  onClose,
  onOpenCustomizer,
}: ProductDetailModalProps) => {
  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#E5DCD2] bg-white p-6 shadow-2xl space-y-6 md:p-8">
        
        <button
          onClick={onClose}
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-[#FAF6F2] text-xs font-bold text-[#756A63] hover:text-black"
        >
          ✕
        </button>

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="relative h-60 w-full overflow-hidden rounded-2xl shadow-sm">
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-cover"
              />
              <span className="absolute left-3 top-3 rounded-md bg-[#163E2B] px-2.5 py-1 text-[10px] font-bold text-white">
                {product.sku}
              </span>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#756A63]">
                THÔNG TIN CHI TIẾT
              </span>
              <h3 className="text-xl font-black text-[#163E2B]">{product.name}</h3>
              <div className="pt-0.5 text-base font-extrabold text-[#163E2B]">
                {product.basePrice.toLocaleString('vi-VN')} đ
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#756A63]">{product.description}</p>

            <button
              onClick={() => {
                onClose();
                onOpenCustomizer(product);
              }}
              className="w-full rounded-full bg-[#163E2B] py-3 text-xs font-bold text-white shadow-md transition hover:bg-[#1f4f38]"
            >
              Chọn Món Này →
            </button>
          </div>
        </div>

        {/* Danh sách kích thước & topping thực tế từ Database */}
        <div className="space-y-3 border-t border-[#E5DCD2] pt-4 text-xs">
          <div>
            <span className="font-bold text-[#163E2B] block mb-1.5">Các kích thước sẵn có:</span>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <span key={v.id} className="px-3 py-1.5 rounded-xl bg-[#FAF6F2] border border-[#E5DCD2] text-[#4A3E36] font-medium">
                  Size {v.size} — <strong>{v.price.toLocaleString('vi-VN')} đ</strong> (Còn {v.stock} phần)
                </span>
              ))}
            </div>
          </div>

          {product.toppings.length > 0 && (
            <div>
              <span className="font-bold text-[#163E2B] block mb-1.5">Topping thêm:</span>
              <div className="flex flex-wrap gap-2">
                {product.toppings.map((t) => (
                  <span key={t.id} className="px-3 py-1.5 rounded-xl bg-[#FAF6F2] border border-[#E5DCD2] text-[#4A3E36]">
                    + {t.name} (<strong>{t.price.toLocaleString('vi-VN')} đ</strong>)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};