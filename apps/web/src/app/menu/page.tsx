'use client';

import { useState, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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
  const menuSectionRef = useRef<HTMLDivElement>(null);

  const { data: products = [], isLoading, isError, error, refetch } = useMenuProducts();

  const categories = [
    { key: 'all', label: 'Tất cả' },
    { key: 'COFFEE', label: 'Cà phê' },
    { key: 'TEA', label: 'Trà' },
    { key: 'COLD-BREW', label: 'Đồ uống lạnh' },
  ];

  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      let matchCategory = true;
      if (selectedCategory === 'COFFEE') {
        matchCategory = item.sku.includes('COFFEE') || item.sku.includes('CAPPUCCINO');
      } else if (selectedCategory === 'TEA') {
        matchCategory = item.sku.includes('TEA');
      } else if (selectedCategory === 'COLD-BREW') {
        matchCategory = item.sku.includes('COLD-BREW');
      }

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
      setEditingCartItem(null);
      setPreviewingProduct(product);
      return;
    }

    cartStore.addItem({
      product,
      variantId: variant.id,
      size: variant.size,
      unitPrice: Number(variant.price),
      quantity: 1,
      sugarLevel: null,
      iceLevel: null,
      toppings: [],
    });
  };

  const scrollToMenu = () => {
    menuSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-screen bg-[#FBF8F3] text-[#1A1612] antialiased overflow-x-hidden selection:bg-[#153D2C] selection:text-white">
      
      {/* ==================== ẢNH NỀN TOÀN TRANG ==================== */}
      <div className="pointer-events-none fixed inset-0 z-0 select-none">
        <Image
          src="/background_brewlite2.png"
          alt="BrewLite Background"
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
        />
      </div>

      {/* ==================== CONTAINER NỘI DUNG CHÍNH ==================== */}
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 py-4 sm:px-6 space-y-6">

        {/* 1. TOP NAVBAR (Kích thước to, rõ nét, cân đối) */}
        <header className="flex items-center justify-between border-b border-[#E8DFC8]/70 pb-4 pt-2">
          {/* Logo phóng to nổi bật */}
<Link 
  href="/menu" 
  className="relative block h-16 w-60 sm:h-20 sm:w-72 md:h-24 md:w-80 transition-transform hover:opacity-90"
>
  <Image
    src="/logo.png"
    alt="BrewLite Cà Phê Trà"
    fill
    priority
    className="object-contain object-left scale-125 origin-left"
    sizes="360px"
  />
</Link>
{/* Menu chính ở giữa: Cỡ 14px vừa vặn, giãn cách gap-8 */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#2C2117]">
            <button
              type="button"
              onClick={scrollToMenu}
              className="transition hover:text-[#153D2C]"
            >
              Thực đơn
            </button>
            <Link
              href="#about"
              className="transition hover:text-[#153D2C]"
            >
              Về BrewLite
            </Link>
            <Link
              href="#contact"
              className="transition hover:text-[#153D2C]"
            >
              Liên hệ
            </Link>
          </nav>

          {/* Cụm bên phải: SGU Campus + Nút Giỏ hàng chuẩn vừa mắt */}
          <div className="flex items-center gap-5">
            {/* Địa điểm SGU Campus: Chữ 13px, icon h-4.5 w-4.5 */}
            <div className="hidden sm:flex items-center gap-1.5 text-[13px] font-semibold text-[#3D2E24]">
              <svg
                className="h-4.5 w-4.5 text-[#8B4513]"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                  clipRule="evenodd"
                />
              </svg>
              <span>SGU Campus</span>
            </div>

            {/* Nút Giỏ hàng: px-4 py-2, chữ 13px, icon h-4 w-4 */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-2 rounded-full bg-[#153D2C] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#1b4b36] active:scale-95"
            >
              <svg
                className="h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.8"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25c-.669 0-1.189-.578-1.119-1.243l1.263-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                />
              </svg>
              <span>Giỏ hàng</span>

              {/* Badge số lượng nhỏ gọn h-4.5 min-w-[18px] */}
              <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-[#153D2C]">
                {cart.totalQuantity}
              </span>
            </button>
          </div>
        </header>

        {/* 2. HERO BANNER + 3 CAM KẾT */}
        <HeroBanner onExploreClick={scrollToMenu} />

        {/* 3. MENU SECTION */}
        <section ref={menuSectionRef} className="space-y-4 pt-1">
          {/* Tiêu đề & Ô tìm kiếm */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#B85D36]">
                THỰC ĐƠN BREWLITE
              </span>
              {/* Tiêu đề to hơn, phông tròn mềm hiện đại */}
              <h3 className="font-sans text-3xl font-bold tracking-tight text-[#1C1712] sm:text-4xl sm:leading-tight">
                Một chút ngon, một chút ấm.
              </h3>
              <p className="text-sm font-medium text-[#7A6C60]">
                Chọn món bạn thích, BrewLite pha ngay.
              </p>
            </div>

            {/* Ô tìm kiếm món */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm món yêu thích..."
                className="w-full rounded-full border border-[#DED4C0] bg-white/90 py-2 pl-9 pr-7 text-xs text-[#1A1612] placeholder-[#A39282] outline-none backdrop-blur-sm transition focus:border-[#153D2C] focus:bg-white"
              />

              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A7968]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>

              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#7A6C60] hover:text-black"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* HÀNG FILTER VÀ SỐ LƯỢNG MÓN */}
          <div className="flex items-center justify-between border-b border-[#E8DFC8]/70 pb-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 font-medium transition ${
                    selectedCategory === cat.key
                      ? 'bg-[#153D2C] text-white shadow-sm'
                      : 'border border-[#DED4C0] bg-white/80 text-[#5A4D43] hover:border-[#153D2C]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <span className="whitespace-nowrap text-xs text-[#8A7968]">
              {isLoading ? 'Đang tải...' : `${filteredProducts.length} món`}
            </span>
          </div>

          {/* SKELETON */}
          {isLoading && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* ERROR */}
          {isError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-10 text-center space-y-3">
              <h4 className="text-sm font-bold text-rose-800">Không thể kết nối đến máy chủ</h4>
              <p className="text-xs text-rose-600 max-w-md mx-auto">{error?.message}</p>
              <button
                onClick={() => refetch()}
                className="px-4 py-1.5 rounded-full bg-[#153D2C] text-white text-xs font-bold shadow hover:bg-[#1f503a]"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* EMPTY */}
          {!isLoading && !isError && filteredProducts.length === 0 && (
            <div className="rounded-2xl border border-[#E0D5C1] bg-white/90 p-12 text-center space-y-2 backdrop-blur-sm">
              <p className="text-sm font-bold text-[#1A1612]">Không tìm thấy món nào</p>
              <span className="text-xs text-[#7A6C60] block">
                Thử tìm với từ khóa khác hoặc xóa bộ lọc.
              </span>
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="mt-2 text-xs font-bold text-[#153D2C] hover:underline"
              >
                Xóa bộ lọc & xem tất cả món
              </button>
            </div>
          )}

          {/* LƯỚI DANH SÁCH MÓN ĂN */}
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
        </section>

        {/* 4. FOOTER */}
        <footer className="mt-12 flex flex-col sm:flex-row items-center justify-between border-t border-[#E8DFC8]/70 py-6 text-xs text-[#7A6C60] gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-6 w-20">
              <Image
                src="/logo.png"
                alt="BrewLite"
                fill
                className="object-contain object-left"
                sizes="80px"
              />
            </div>
            <span>·</span>
            <span>Nhà gỗ mộc ấm · SGU Campus</span>
          </div>

          <div className="flex items-center gap-6">
            <button type="button" onClick={scrollToMenu} className="hover:text-[#153D2C]">
              Thực đơn
            </button>
            <Link href="#about" className="hover:text-[#153D2C]">
              Về BrewLite
            </Link>
            <Link href="#contact" className="hover:text-[#153D2C]">
              Liên hệ
            </Link>
          </div>
        </footer>

      </div>

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
    </div>
  );
}
