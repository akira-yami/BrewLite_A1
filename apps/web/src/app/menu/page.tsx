'use client';

import { useState, useMemo } from 'react';
import { Product } from '@/features/catalog/types';
import { useMenuProducts } from '@/features/catalog/hooks/useMenuProducts';
import { HeroBanner } from '@/features/catalog/components/HeroBanner';
import { ProductCard } from '@/features/catalog/components/ProductCard';
import { ProductCardSkeleton } from '@/features/catalog/components/ProductCardSkeleton';
import { ProductDetailModal } from '@/features/catalog/components/ProductDetailModal';
import { CartDrawer } from '@/features/cart/components/CartDrawer';
import { CartItem, cartStore, formatVnd, useCartStore } from '@/stores/cart-store';

export default function MenuPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingProduct, setPreviewingProduct] = useState<Product | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cart = useCartStore();

  // 1. Fetch dữ liệu thật từ API NestJS qua TanStack Query
  const { data: products = [], isLoading, isError, error, refetch } = useMenuProducts();

  const categories = [
    { key: 'all', label: 'Tất Cả' },
    { key: 'COFFEE', label: '☕ Cà Phê Mộc' },
    { key: 'TEA', label: '🌿 Trà Thảo Mộc' },
    { key: 'COLD-BREW', label: '❄️ Đá Tuyết Lạnh' },
    { key: 'PASTRY', label: '🥐 Bánh Lò Nướng' },
  ];

  // 2. Lọc sản phẩm theo danh mục và từ khóa
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      // Phân loại danh mục dựa trên tiền tố SKU
      const matchCategory = selectedCategory === 'all' || item.sku.includes(selectedCategory);
      
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q);

      return matchCategory && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const handleQuickAdd = (product: Product) => {
    const variant = product.variants.find((item) => item.size === 'M') ?? product.variants[0];
    if (!variant) {
      setPreviewingProduct(product);
      return;
    }

    cartStore.addItem({
      product,
      variantId: variant.id,
      size: variant.size,
      unitPrice: variant.price,
      quantity: 1,
      toppings: [],
    });
  };

  return (
    <main className="min-h-screen bg-[#F5EFEB] p-3 text-[#1E1813] antialiased md:p-6 pb-24">
      <div className="mx-auto max-w-7xl space-y-7">
        
        {/* Top Navbar Responsive */}
        <header className="flex items-center justify-between rounded-full border border-[#E5DCD2] bg-white/90 px-4 py-2.5 sm:px-5 sm:py-3 shadow-sm backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-[#163E2B] text-sm sm:text-base font-bold text-white shadow-sm">
              ☕
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm sm:text-base font-black tracking-tight text-[#163E2B]">BrewLite</h1>
                <span className="rounded-full border border-[#c4ded0] bg-[#e8f1ec] px-2 py-0.5 text-[9px] font-extrabold uppercase text-[#163E2B]">
                  Live Menu
                </span>
              </div>
              <span className="hidden sm:block text-[10px] text-[#756A63]">Nhà gỗ mộc ấm áp • SGU Campus</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] font-semibold text-[#163E2B] sm:inline">
              Ủ nóng 70°C • Chiết xuất tươi
            </span>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative flex h-10 items-center gap-2 rounded-full bg-[#163E2B] px-3 text-xs font-black text-white shadow-md transition hover:bg-[#1f4f38]"
              aria-label="Mở giỏ hàng"
            >
              <span>Giỏ</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] text-[#163E2B]">
                {cart.totalQuantity}
              </span>
            </button>
          </div>
        </header>

        {/* Hero Banner (Chỉ hiện khi đã tải xong và có sản phẩm) */}
        {!isLoading && !isError && products.length > 0 && (
          <HeroBanner
            products={products}
            onSelectProduct={(p) => {
              setEditingCartItem(null);
              setPreviewingProduct(p);
            }}
          />
        )}

        {/* Bộ lọc Categories & Ô tìm kiếm */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs font-bold no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`whitespace-nowrap rounded-full px-4 py-2 transition-all shadow-sm ${
                  selectedCategory === cat.key
                    ? 'bg-[#163E2B] text-white shadow-[#163E2B]/20'
                    : 'border border-[#E5DCD2] bg-white text-[#4A3E36] hover:border-[#163E2B]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm món, nốt vị, xuất xứ..."
              className="w-full rounded-full border border-[#E5DCD2] bg-white py-2 pl-9 pr-8 text-xs text-[#1E1813] placeholder-[#8C7D73] shadow-inner transition focus:border-[#163E2B] focus:outline-none"
            />
            <span className="pointer-events-none absolute left-3 top-2 text-xs text-[#756A63]">
              🔍
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2 text-xs text-[#8C7D73] hover:text-[#163E2B]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tiêu đề danh sách */}
        <div className="flex items-center justify-between border-b border-[#E5DCD2] pb-2">
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#756A63]">
              THỰC ĐƠN QUẦY BAR
            </span>
            <h3 className="text-lg sm:text-xl font-black text-[#163E2B]">
              Tuyển Chọn Hạt Mộc & Thức Uống Lò Sưởi
            </h3>
          </div>
          <span className="text-xs text-[#756A63]">
            {isLoading ? 'Đang tải thực đơn...' : `${filteredProducts.length} món`}
          </span>
        </div>

        {/* TRẠNG THÁI 1: LOADING SKELETON */}
        {isLoading && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* TRẠNG THÁI 2: ERROR STATE */}
        {isError && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-10 text-center space-y-3">
            <div className="text-3xl">⚠️</div>
            <h4 className="text-base font-bold text-rose-800">Không thể kết nối đến máy chủ</h4>
            <p className="text-xs text-rose-600 max-w-md mx-auto">{error?.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-5 py-2 rounded-full bg-[#163E2B] text-white text-xs font-bold shadow hover:bg-[#1f4f38] transition"
            >
              🔄 Thử lại
            </button>
          </div>
        )}

        {/* TRẠNG THÁI 3: EMPTY STATE */}
        {!isLoading && !isError && filteredProducts.length === 0 && (
          <div className="rounded-3xl border border-[#E5DCD2] bg-white p-12 text-center space-y-2">
            <div className="text-3xl">☕</div>
            <p className="text-base font-semibold text-[#1E1813]">Chưa có món nào phù hợp</p>
            <span className="text-xs text-[#756A63] block">
              Không tìm thấy thức uống theo bộ lọc hoặc từ khóa &quot;{searchQuery}&quot;.
            </span>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="mt-3 text-xs font-bold text-[#163E2B] hover:underline"
            >
              Xóa bộ lọc & xem tất cả món
            </button>
          </div>
        )}

        {/* TRẠNG THÁI 4: SUCCESS GRID */}
        {!isLoading && !isError && filteredProducts.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onPreview={(item) => {
                  setEditingCartItem(null);
                  setPreviewingProduct(item);
                }}
                onCustomize={(item) => {
                  setEditingCartItem(null);
                  setPreviewingProduct(item);
                }}
                onQuickAdd={handleQuickAdd}
              />
            ))}
          </div>
        )}

      </div>

      {/* Modal chi tiết sản phẩm */}
      <ProductDetailModal
        product={previewingProduct}
        editingItem={editingCartItem}
        onClose={() => {
          setPreviewingProduct(null);
          setEditingCartItem(null);
        }}
        onAddedToCart={() => setIsCartOpen(true)}
      />

      {cart.totalQuantity > 0 && (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-24px)] max-w-xl -translate-x-1/2 items-center justify-between rounded-full border border-[#E5DCD2] bg-[#163E2B] px-4 py-3 text-sm font-black text-white shadow-2xl transition hover:bg-[#1f4f38] md:hidden"
        >
          <span>{cart.totalQuantity} món trong giỏ</span>
          <span className="font-mono">{formatVnd(cart.subtotal)}</span>
        </button>
      )}

      <CartDrawer
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onEditOptions={(item) => {
          const product = products.find((candidate) => candidate.id === item.productId);
          if (!product) return;

          setEditingCartItem(item);
          setPreviewingProduct(product);
          setIsCartOpen(false);
        }}
      />
    </main>
  );
}
