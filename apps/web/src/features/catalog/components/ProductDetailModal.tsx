'use client';

import Image from 'next/image';
import { useState } from 'react';
import { CartItem, cartStore, formatVnd } from '@/stores/cart-store';
import { Product, ProductSize } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddedToCart?: () => void;
  editingItem?: CartItem | null;
}

const percentageOptions = [0, 30, 50, 70, 100];

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

function ProductDetailModalContent({
  product,
  onClose,
  onAddedToCart,
  editingItem,
}: {
  product: Product;
  onClose: () => void;
  onAddedToCart?: () => void;
  editingItem?: CartItem | null;
}) {
  const defaultVariant = product.variants.find((variant) => variant.size === 'M') ?? product.variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState(
    editingItem?.variantId ?? defaultVariant?.id ?? '',
  );
  const [selectedToppingIds, setSelectedToppingIds] = useState<string[]>(
    editingItem?.toppings.map((topping) => topping.id) ?? [],
  );
  const [quantity, setQuantity] = useState(editingItem?.quantity ?? 1);
  const [sugarLevel, setSugarLevel] = useState<number | null>(editingItem?.sugarLevel ?? 100);
  const [iceLevel, setIceLevel] = useState<number | null>(editingItem?.iceLevel ?? 70);
  const [note, setNote] = useState(editingItem?.note ?? '');

  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId);
  const selectedToppings = product.toppings.filter((topping) =>
    selectedToppingIds.includes(topping.id),
  );

  const variantPrice = selectedVariant?.price ?? product.basePrice;
  const toppingsTotal = selectedToppings.reduce((sum, topping) => sum + topping.price, 0);
  const itemTotal = (variantPrice + toppingsTotal) * quantity;

  const toggleTopping = (toppingId: string) => {
    setSelectedToppingIds((current) =>
      current.includes(toppingId)
        ? current.filter((id) => id !== toppingId)
        : [...current, toppingId],
    );
  };

  const handleAddToCart = () => {
    if (!selectedVariant) return;

    const cartInput = {
      product,
      variantId: selectedVariant.id,
      size: selectedVariant.size as ProductSize,
      unitPrice: selectedVariant.price,
      quantity,
      toppings: selectedToppings.map((topping) => ({
        id: topping.id,
        name: topping.name,
        price: topping.price,
      })),
      sugarLevel: editingItem ? sugarLevel : null,
      iceLevel: editingItem ? iceLevel : null,
      note: editingItem ? note : null,
    };

    if (editingItem) {
      cartStore.replaceItem(editingItem.id, cartInput);
    } else {
      cartStore.addItem(cartInput);
    }

    onAddedToCart?.();
    onClose();
  };

  if (editingItem) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[1px]">
        <section className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-t-[2rem] border border-[#E5DCD2] bg-white shadow-2xl">
          <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-[#D6CEC6]" />

          <div className="flex max-h-[88vh] flex-col">
            <div className="flex items-start justify-between px-6 pb-4 pt-7 md:px-8">
              <h2 className="text-3xl font-black leading-tight text-[#073F2B]">Sửa tùy chọn</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5DCD2] bg-[#FAF6F2] text-3xl leading-none text-[#073F2B] transition hover:bg-white"
                aria-label="Đóng sửa tùy chọn"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-5 md:px-8">
              <div className="grid grid-cols-[96px_1fr] items-center gap-4 border-b border-[#E5DCD2] pb-5">
                <div className="relative h-24 overflow-hidden rounded-2xl bg-[#FAF6F2]">
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-xl font-black leading-snug text-[#1E1813]">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-[#756A63]">
                    Giá gốc {formatVnd(selectedVariant?.price ?? product.basePrice)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-[#073F2B]">Chọn size</h3>
                <div className="grid grid-cols-3 gap-3">
                  {product.variants.map((variant) => {
                    const selected = selectedVariantId === variant.id;

                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setSelectedVariantId(variant.id)}
                        className={`rounded-2xl border px-3 py-3 text-center transition ${
                          selected
                            ? 'border-[#073F2B] bg-[#073F2B] text-white shadow-lg shadow-[#073F2B]/20'
                            : 'border-[#E5DCD2] bg-[#FAF6F2] text-[#1E1813] hover:border-[#bfb3a8]'
                        }`}
                      >
                        <span className="block text-lg font-black">{variant.size}</span>
                        <span className="mt-0.5 block text-sm font-semibold opacity-85">
                          {formatVnd(variant.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {product.toppings.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-[#073F2B]">Topping</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {product.toppings.map((topping) => {
                      const selected = selectedToppingIds.includes(topping.id);

                      return (
                        <button
                          key={topping.id}
                          type="button"
                          disabled={!topping.available}
                          onClick={() => toggleTopping(topping.id)}
                          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                            selected
                              ? 'border-[#073F2B] bg-[#073F2B] text-white shadow-lg shadow-[#073F2B]/15'
                              : 'border-[#E5DCD2] bg-[#FAF6F2] text-[#4A3E36] hover:border-[#bfb3a8]'
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
                              selected
                                ? 'border-white bg-white text-[#073F2B]'
                                : 'border-[#C9BFB4] bg-white text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-black">{topping.name}</span>
                            <span className="block text-xs opacity-80">+ {formatVnd(topping.price)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <PercentageSelector
                label="Mức đường"
                value={sugarLevel}
                onChange={setSugarLevel}
              />

              <PercentageSelector
                label="Mức đá"
                value={iceLevel}
                onChange={setIceLevel}
              />

              <label className="block space-y-2">
                <span className="text-lg font-black text-[#073F2B]">Ghi chú</span>
                <input
                  type="text"
                  value={note}
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ví dụ: ít đá, không khuấy"
                  className="w-full rounded-2xl border border-[#E5DCD2] bg-[#FAF6F2] px-4 py-3 text-sm font-semibold text-[#1E1813] placeholder-[#A99D94] outline-none transition focus:border-[#073F2B] focus:bg-white"
                />
              </label>
            </div>

            <div className="shrink-0 space-y-4 border-t border-[#E5DCD2] bg-white px-6 py-4 md:px-8">
              <div className="flex items-center justify-between rounded-2xl bg-[#E8F1EC] px-4 py-3">
                <span className="text-base font-black text-[#073F2B]">Tạm tính món</span>
                <strong className="font-mono text-2xl text-[#073F2B]">{formatVnd(itemTotal)}</strong>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-[#E5DCD2] bg-[#FAF6F2] py-3 text-sm font-black text-[#1E1813] transition hover:bg-white"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!selectedVariant}
                  className="rounded-full bg-[#073F2B] py-3 text-sm font-black text-white shadow-lg shadow-[#073F2B]/20 transition hover:bg-[#0d4c36] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Lưu thay đổi
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#E5DCD2] bg-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#FAF6F2] text-xs font-bold text-[#756A63] hover:text-black"
        >
          ✕
        </button>

        <div className="flex-1 space-y-6 overflow-y-auto p-6 md:p-8">
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
                  CHI TIẾT & TÙY BIẾN
                </span>
                <h3 className="text-xl font-black text-[#163E2B]">{product.name}</h3>
                <div className="pt-0.5 text-base font-extrabold text-[#163E2B]">
                  {formatVnd(selectedVariant?.price ?? product.basePrice)}
                </div>
              </div>

              <p className="text-xs leading-relaxed text-[#756A63]">{product.description}</p>

              <div className="rounded-2xl border border-[#E5DCD2] bg-[#FAF6F2] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#163E2B]">Số lượng</span>
                  <div className="flex items-center rounded-full border border-[#E5DCD2] bg-white">
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      className="flex h-8 w-8 items-center justify-center font-black text-[#163E2B]"
                    >
                      -
                    </button>
                    <span className="w-9 text-center font-black text-[#1E1813]">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => value + 1)}
                      className="flex h-8 w-8 items-center justify-center font-black text-[#163E2B]"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-[#E5DCD2] pt-4 text-xs">
            <div>
              <span className="font-bold text-[#163E2B] block mb-1.5">Các kích thước sẵn có:</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`rounded-xl border px-3 py-2 text-left font-medium transition ${
                      selectedVariantId === variant.id
                        ? 'border-[#163E2B] bg-[#E8F1EC] text-[#163E2B]'
                        : 'border-[#E5DCD2] bg-[#FAF6F2] text-[#4A3E36] hover:border-[#c9bcaf]'
                    }`}
                  >
                    <span className="block font-black">Size {variant.size}</span>
                    <span>{formatVnd(variant.price)} • Còn {variant.stock}</span>
                  </button>
                ))}
              </div>
            </div>

            {product.toppings.length > 0 && (
              <div>
                <span className="font-bold text-[#163E2B] block mb-1.5">Topping thêm:</span>
                <div className="flex flex-wrap gap-2">
                  {product.toppings.map((topping) => (
                    <button
                      key={topping.id}
                      type="button"
                      disabled={!topping.available}
                      onClick={() => toggleTopping(topping.id)}
                      className={`rounded-xl border px-3 py-2 transition ${
                        selectedToppingIds.includes(topping.id)
                          ? 'border-[#163E2B] bg-[#E8F1EC] text-[#163E2B]'
                          : 'border-[#E5DCD2] bg-[#FAF6F2] text-[#4A3E36] hover:border-[#c9bcaf]'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      + {topping.name} <strong>{formatVnd(topping.price)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-[#E5DCD2] bg-white/95 p-4 backdrop-blur md:px-8">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!selectedVariant}
            className="flex w-full items-center justify-between rounded-full bg-[#163E2B] px-5 py-3 text-sm font-black text-white shadow-md transition hover:bg-[#1f4f38] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>Thêm vào giỏ</span>
            <span className="font-mono">{formatVnd(itemTotal)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PercentageSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-black text-[#073F2B]">{label}</h3>
      <div className="grid grid-cols-5 gap-2 rounded-2xl border border-[#E5DCD2] bg-[#FAF6F2] p-2">
        {percentageOptions.map((option) => {
          const selected = value === option;

          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm font-black transition ${
                selected
                  ? 'bg-[#073F2B] text-white shadow-lg shadow-[#073F2B]/15'
                  : 'text-[#4A3E36] hover:bg-white'
              }`}
            >
              <span
                className={`h-4 w-4 shrink-0 rounded-full border ${
                  selected
                    ? 'border-white bg-white shadow-[inset_0_0_0_4px_#073F2B]'
                    : 'border-[#C9BFB4] bg-white'
                }`}
              />
              <span>{option}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
