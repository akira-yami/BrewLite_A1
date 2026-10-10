'use client';

import { useState, useMemo } from 'react';
import { Product } from '@/features/catalog/types';
import { useMenuProducts } from '@/features/catalog/hooks/useMenuProducts';
import { HeroBanner } from '@/features/catalog/components/HeroBanner';
import { ProductCard } from '@/features/catalog/components/ProductCard';
import { ProductCardSkeleton } from '@/features/catalog/components/ProductCardSkeleton';
import { ProductDetailModal } from '@/features/catalog/components/ProductDetailModal';

export default function MenuPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingProduct, setPreviewingProduct] = useState<Product | null>(null);

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
          <span className="text-[11px] sm:text-xs font-semibold text-[#163E2B]">Ủ nóng 70°C • Chiết xuất tươi</span>
        </header>

        {/* Hero Banner (Chỉ hiện khi đã tải xong và có sản phẩm) */}
        {!isLoading && !isError && products.length > 0 && (
          <HeroBanner
            products={products}
            onSelectProduct={(p) => setPreviewingProduct(p)}
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
              Không tìm thấy thức uống theo bộ lọc hoặc từ khóa "{searchQuery}".
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
                onPreview={(item) => setPreviewingProduct(item)}
                onCustomize={(item) => {
                  setPreviewingProduct(item);
                }}
              />
            ))}
          </div>
        )}

      </div>

      {/* Modal chi tiết sản phẩm */}
      <ProductDetailModal
        product={previewingProduct}
        onClose={() => setPreviewingProduct(null)}
        onOpenCustomizer={(item) => {
          console.log('Tùy biến món:', item.name);
        }}
      />
    </main>
  );
}