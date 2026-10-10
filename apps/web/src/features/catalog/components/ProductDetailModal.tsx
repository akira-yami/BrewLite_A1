'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cartStore, formatVnd } from '@/stores/cart-store';
import { Product, ProductSize } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddedToCart?: () => void;
}

export const ProductDetailModal = ({
  product,
  onClose,
  onAddedToCart,
}: ProductDetailModalProps) => {
  if (!product) return null;

  return (
    <ProductDetailModalContent
      key={product.id}
      product={product}
      onClose={onClose}
      onAddedToCart={onAddedToCart}
    />
  );
};

function ProductDetailModalContent({
  product,
  onClose,
  onAddedToCart,
}: {
  product: Product;
  onClose: () => void;
  onAddedToCart?: () => void;
}) {
  const defaultVariant = product.variants.find((variant) => variant.size === 'M') ?? product.variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState(defaultVariant?.id ?? '');
  const [selectedToppingIds, setSelectedToppingIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

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

    cartStore.addItem({
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
    });

    onAddedToCart?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#E5DCD2] bg-white p-6 shadow-2xl space-y-6 md:p-8">
        
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

        {/* Danh sách kích thước & topping thực tế từ Database */}
        <div className="space-y-3 border-t border-[#E5DCD2] pt-4 text-xs">
          <div>
            <span className="font-bold text-[#163E2B] block mb-1.5">Các kích thước sẵn có:</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVariantId(v.id)}
                  className={`rounded-xl border px-3 py-2 text-left font-medium transition ${
                    selectedVariantId === v.id
                      ? 'border-[#163E2B] bg-[#E8F1EC] text-[#163E2B]'
                      : 'border-[#E5DCD2] bg-[#FAF6F2] text-[#4A3E36] hover:border-[#c9bcaf]'
                  }`}
                >
                  <span className="block font-black">Size {v.size}</span>
                  <span>{formatVnd(v.price)} • Còn {v.stock}</span>
                </button>
              ))}
            </div>
          </div>

          {product.toppings.length > 0 && (
            <div>
              <span className="font-bold text-[#163E2B] block mb-1.5">Topping thêm:</span>
              <div className="flex flex-wrap gap-2">
                {product.toppings.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!t.available}
                    onClick={() => toggleTopping(t.id)}
                    className={`rounded-xl border px-3 py-2 transition ${
                      selectedToppingIds.includes(t.id)
                        ? 'border-[#163E2B] bg-[#E8F1EC] text-[#163E2B]'
                        : 'border-[#E5DCD2] bg-[#FAF6F2] text-[#4A3E36] hover:border-[#c9bcaf]'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    + {t.name} <strong>{formatVnd(t.price)}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-[#E5DCD2] bg-white/95 p-4 backdrop-blur md:-mx-8 md:-mb-8 md:px-8">
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
