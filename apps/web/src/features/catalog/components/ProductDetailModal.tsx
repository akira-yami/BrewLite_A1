'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { CartItem, cartStore, formatVnd } from '@/stores/cart-store';
import { Product } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddedToCart?: () => void;
  editingItem?: CartItem | null;
}

export const ProductDetailModal = ({
  product,
  onClose,
  onAddedToCart,
  editingItem,
}: ProductDetailModalProps) => {
  if (!product) return null;

  return (
    <ProductDetailModalContent
      key={`${product.id}:${editingItem?.id ?? 'new'}`}
      product={product}
      onClose={onClose}
      onAddedToCart={onAddedToCart}
      editingItem={editingItem}
    />
  );
};

const ProductDetailModalContent = ({
  product,
  onClose,
  onAddedToCart,
  editingItem,
}: {
  product: Product;
  onClose: () => void;
  onAddedToCart?: () => void;
  editingItem?: CartItem | null;
}) => {
  const defaultVariant = product.variants.find((v) => v.size === 'M') || product.variants[0];

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    editingItem?.variantId ?? defaultVariant?.id ?? ''
  );
  const [quantity, setQuantity] = useState(editingItem?.quantity ?? 1);
  
  const [sugarLevel, setSugarLevel] = useState<number | null>(editingItem?.sugarLevel ?? null);
  const [iceLevel, setIceLevel] = useState<number | null>(editingItem?.iceLevel ?? null);

  const [selectedToppingIds, setSelectedToppingIds] = useState<string[]>(
    editingItem?.toppings?.map((t) => t.id) ?? []
  );
  const [note, setNote] = useState(editingItem?.note ?? '');

  const toggleTopping = (toppingId: string) => {
    setSelectedToppingIds((prev) =>
      prev.includes(toppingId)
        ? prev.filter((id) => id !== toppingId)
        : [...prev, toppingId]
    );
  };

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) || defaultVariant;

  const itemTotal = useMemo(() => {
    const base = selectedVariant ? Number(selectedVariant.price) : product.basePrice;
    const toppingsSum = selectedToppingIds.reduce((acc, id) => {
      const t = product.toppings?.find((top) => top.id === id);
      return acc + (t ? Number(t.price) : 0);
    }, 0);
    return (base + toppingsSum) * quantity;
  }, [selectedVariant, selectedToppingIds, quantity, product]);

  const handleAddToCart = () => {
    if (!selectedVariant) return;

    const cartInput = {
      product,
      variantId: selectedVariant.id,
      size: selectedVariant.size,
      unitPrice: Number(selectedVariant.price),
      quantity,
      sugarLevel,
      iceLevel,
      note,
      toppings: selectedToppingIds
        .map((id) => product.toppings?.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => t !== undefined)
        .map((t) => ({
          id: t.id,
          name: t.name,
          price: Number(t.price),
        })),
    };

    if (editingItem) {
      cartStore.replaceItem(editingItem.id, cartInput);
    } else {
      cartStore.addItem(cartInput);
    }

    onClose();
    if (onAddedToCart) {
      onAddedToCart();
    }
  };

  const availableToppings = product.toppings || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[88vh] max-h-[700px] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[#1A1612]/5 text-[#5A4D43] transition hover:bg-[#1A1612]/10 hover:text-black"
          aria-label="Đóng"
        >
          ✕
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 space-y-6">
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
                    ? formatVnd(Number(selectedVariant.price))
                    : formatVnd(product.basePrice)}
                </p>
                <p className="mt-2 text-xs text-[#5A4D43] leading-relaxed">
                  {product.description || 'Hương vị tự nhiên, pha chế tươi mới mỗi ngày.'}
                </p>
              </div>

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

          <div className="space-y-2.5">
            <label className="text-xs font-bold text-[#163D2C]">Các kích thước sẵn có:</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {product.variants.map((v) => {
                const isSelected = selectedVariantId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-[#163D2C] bg-[#F2F7F4] text-[#163D2C] ring-1 ring-[#163D2C]'
                        : 'border-[#EBE1D4] bg-[#FAF7F2] text-[#5A4D43] hover:border-[#163D2C]'
                    }`}
                  >
                    <div className="text-xs font-bold">Size {v.size}</div>
                    <div className="text-[11px] font-medium opacity-80">
                      {formatVnd(Number(v.price))} • Còn {v.stock}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163D2C]">Mức đường</label>
              <select
                value={sugarLevel ?? 'standard'}
                onChange={(e) => setSugarLevel(e.target.value === 'standard' ? null : Number(e.target.value))}
                className="w-full rounded-xl border border-[#EBE1D4] bg-[#FAF7F2] p-2.5 text-xs font-medium text-[#1A1612] focus:border-[#163D2C] focus:outline-none"
              >
                <option value="standard">Theo công thức chuẩn</option>
                {[0, 25, 50, 75, 100].map((level) => (
                  <option key={level} value={level}>{level}%</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163D2C]">Mức đá</label>
              <select
                value={iceLevel ?? 'standard'}
                onChange={(e) => setIceLevel(e.target.value === 'standard' ? null : Number(e.target.value))}
                className="w-full rounded-xl border border-[#EBE1D4] bg-[#FAF7F2] p-2.5 text-xs font-medium text-[#1A1612] focus:border-[#163D2C] focus:outline-none"
              >
                <option value="standard">Theo công thức chuẩn</option>
                {[0, 25, 50, 75, 100].map((level) => (
                  <option key={level} value={level}>{level}%</option>
                ))}
              </select>
            </div>
          </div>

          {availableToppings.length > 0 && (
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-[#163D2C]">Topping thêm:</label>
              <div className="flex flex-wrap gap-2">
                {availableToppings.map((t) => {
                  const isSelected = selectedToppingIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!t.available}
                      onClick={() => toggleTopping(t.id)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? 'border-[#163D2C] bg-[#163D2C] text-white shadow-sm'
                          : 'border-[#EBE1D4] bg-[#FAF7F2] text-[#40352C] hover:border-[#163D2C]'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      + {t.name} {formatVnd(Number(t.price))}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5 pb-2">
            <label className="text-xs font-bold text-[#163D2C]">
              Ghi chú cho món
            </label>
            <textarea
              name="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ví dụ: để topping riêng"
              className="mt-1 block w-full rounded-xl border border-[#EBE1D4] bg-[#FAF7F2] px-3 py-2 text-xs font-medium text-[#1A1612] focus:border-[#163D2C] focus:outline-none"
            />
            <div className="text-right text-[10px] text-[#A39282]">{note.length}/500</div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[#EBE1D4] bg-white p-4 sm:px-8">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!selectedVariant}
            className="flex w-full items-center justify-between rounded-full bg-[#163D2C] px-6 py-3.5 text-white shadow-md transition hover:bg-[#1f503a] active:scale-[0.99]"
          >
            <span className="text-sm font-bold">
              {editingItem ? 'Cập nhật giỏ' : 'Thêm vào giỏ'}
            </span>
            <span className="text-sm font-extrabold tracking-wide">
              {formatVnd(itemTotal)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
