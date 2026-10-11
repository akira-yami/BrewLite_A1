'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { Product, ProductVariant } from '../types';
import { cartStore } from '@/stores/cart-store';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddedToCart?: () => void;
}

interface ToppingOption {
  id: string;
  name: string;
  price: number;
}

const AVAILABLE_TOPPINGS: ToppingOption[] = [
  { id: 'top-1', name: 'Trân châu trắng tuyết hoa', price: 8000 },
  { id: 'top-2', name: 'Kem cheese mật ong béo ngậy', price: 10000 },
  { id: 'top-3', name: 'Extra Shot Espresso Cầu Đất', price: 12000 },
  { id: 'top-4', name: 'Thạch sương sáo thảo mộc', price: 6000 },
];

export const ProductDetailModal = ({
  product,
  onClose,
  onAddedToCart,
}: ProductDetailModalProps) => {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sugarLevel, setSugarLevel] = useState('Theo công thức chuẩn');
  const [iceLevel, setIceLevel] = useState('Theo công thức chuẩn');
  const [selectedToppings, setSelectedToppings] = useState<ToppingOption[]>([]);

  useEffect(() => {
    if (product && product.variants.length > 0) {
      const defaultVariant = product.variants.find((v) => v.size === 'M') || product.variants[0];

// eslint-disable-next-line react-hooks/set-state-in-effect
setSelectedVariant(defaultVariant);
      setQuantity(1);
      setSelectedToppings([]);
      setSugarLevel('Theo công thức chuẩn');
      setIceLevel('Theo công thức chuẩn');
    }
  }, [product]);

  const toggleTopping = (topping: ToppingOption) => {
    setSelectedToppings((prev) =>
      prev.some((t) => t.id === topping.id)
        ? prev.filter((t) => t.id !== topping.id)
        : [...prev, topping]
    );
  };

  const totalPrice = useMemo(() => {
    if (!selectedVariant) return 0;
    const base = Number(selectedVariant.price);
    const toppingsSum = selectedToppings.reduce((acc, t) => acc + t.price, 0);
    return (base + toppingsSum) * quantity;
  }, [selectedVariant, selectedToppings, quantity]);

  if (!product) return null;

  const handleAddToCart = () => {
    if (!selectedVariant) return;

    let sugarVal: number | null = null;
    if (sugarLevel === 'Không đường (0%)') sugarVal = 0;
    else if (sugarLevel === 'Ít đường (50%)') sugarVal = 50;
    else if (sugarLevel === 'Theo công thức chuẩn') sugarVal = 100;

    let iceVal: number | null = null;
    if (iceLevel === 'Không đá') iceVal = 0;
    else if (iceLevel === 'Ít đá (50%)') iceVal = 50;
    else if (iceLevel === 'Theo công thức chuẩn') iceVal = 100;

    cartStore.addItem({
      product,
      variantId: selectedVariant.id,
      size: selectedVariant.size,
      unitPrice: Number(selectedVariant.price),
      quantity,
      sugarLevel: sugarVal,
      iceLevel: iceVal,
      toppings: selectedToppings.map((t) => ({
        id: t.id,
        name: t.name,
        price: t.price,
      })),
    });

    onClose();
    if (onAddedToCart) {
      onAddedToCart();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Lớp nền làm mờ phía sau */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Cửa sổ Modal */}
      <div className="relative z-10 flex h-[88vh] max-h-[700px] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Nút đóng (X) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[#1A1612]/5 text-[#5A4D43] transition hover:bg-[#1A1612]/10 hover:text-black"
          aria-label="Đóng"
        >
          ✕
        </button>

        {/* 1. KHU VỰC NỘI DUNG CUỘN ĐỘC LẬP */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 space-y-6">
          {/* Ảnh & Thông tin món */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="relative h-52 sm:h-56 w-full overflow-hidden rounded-2xl bg-[#F7F3ED]">
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 50vw"
              />
              <span className="absolute left-3 top-3 rounded-md bg-[#163D2C] px-2.5 py-1 text-[10px] font-bold tracking-wider text-white">
                {product.sku}
              </span>
            </div>

            <div className="flex flex-col justify-between space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#A39282]">
                  CHI TIẾT & TÙY BIẾN
                </span>
                <h3 className="font-serif text-2xl font-black text-[#163D2C]">
                  {product.name}
                </h3>
                <p className="mt-1 text-lg font-bold text-[#1A1612]">
                  {selectedVariant
                    ? `${Number(selectedVariant.price).toLocaleString('vi-VN')} đ`
                    : `${product.basePrice.toLocaleString('vi-VN')} đ`}
                </p>
                <p className="mt-2 text-xs text-[#5A4D43] leading-relaxed">
                  {product.description || 'Hương vị tự nhiên, pha chế tươi mới mỗi ngày.'}
                </p>
              </div>

              {/* Bộ đếm số lượng */}
              <div className="flex items-center justify-between rounded-2xl border border-[#EBE1D4] bg-[#FAF7F2] p-3">
                <span className="text-xs font-bold text-[#1A1612]">Số lượng</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[#D5C9B8] bg-white text-sm font-bold text-[#1A1612] transition hover:bg-[#F3EDE3] active:scale-95"
                  >
                    -
                  </button>
                  <span className="w-5 text-center text-xs font-bold text-[#1A1612]">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[#D5C9B8] bg-white text-sm font-bold text-[#1A1612] transition hover:bg-[#F3EDE3] active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-[#EBE1D4]" />

          {/* Chọn Size */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-[#163D2C]">Các kích thước sẵn có:</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {product.variants.map((v) => {
                const isSelected = selectedVariant?.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariant(v)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-[#163D2C] bg-[#F2F7F4] text-[#163D2C] ring-1 ring-[#163D2C]'
                        : 'border-[#EBE1D4] bg-[#FAF7F2] text-[#5A4D43] hover:border-[#163D2C]'
                    }`}
                  >
                    <div className="text-xs font-bold">Size {v.size}</div>
                    <div className="text-[11px] font-medium opacity-80">
                      {Number(v.price).toLocaleString('vi-VN')} đ • Còn {v.stock}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dropdown Đường & Đá */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163D2C]">Mức đường</label>
              <select
                value={sugarLevel}
                onChange={(e) => setSugarLevel(e.target.value)}
                className="w-full rounded-xl border border-[#EBE1D4] bg-[#FAF7F2] p-2.5 text-xs font-medium text-[#1A1612] focus:border-[#163D2C] focus:outline-none"
              >
                <option>Theo công thức chuẩn</option>
                <option>Ít đường (50%)</option>
                <option>Không đường (0%)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163D2C]">Mức đá</label>
              <select
                value={iceLevel}
                onChange={(e) => setIceLevel(e.target.value)}
                className="w-full rounded-xl border border-[#EBE1D4] bg-[#FAF7F2] p-2.5 text-xs font-medium text-[#1A1612] focus:border-[#163D2C] focus:outline-none"
              >
                <option>Theo công thức chuẩn</option>
                <option>Ít đá (50%)</option>
                <option>Không đá</option>
              </select>
            </div>
          </div>

          {/* Topping */}
          <div className="space-y-2.5 pb-2">
            <label className="text-xs font-bold text-[#163D2C]">Topping thêm:</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOPPINGS.map((t) => {
                const isSelected = selectedToppings.some((item) => item.id === t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTopping(t)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                      isSelected
                        ? 'border-[#163D2C] bg-[#163D2C] text-white shadow-sm'
                        : 'border-[#EBE1D4] bg-[#FAF7F2] text-[#40352C] hover:border-[#163D2C]'
                    }`}
                  >
                    + {t.name} {t.price.toLocaleString('vi-VN')} đ
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. CHÂN ĐẾ FOOTER TÁCH BIỆT CỐ ĐỊNH Ở ĐÁY */}
        <div className="shrink-0 border-t border-[#EBE1D4] bg-white p-4 sm:px-8">
          <button
            type="button"
            onClick={handleAddToCart}
            className="flex w-full items-center justify-between rounded-full bg-[#163D2C] px-6 py-3.5 text-white shadow-md transition hover:bg-[#1f503a] active:scale-[0.99]"
          >
            <span className="text-sm font-bold">Thêm vào giỏ</span>
            <span className="text-sm font-extrabold tracking-wide">
              {totalPrice.toLocaleString('vi-VN')} đ
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};