'use client';

import Image from 'next/image';
import { Product } from '../types';

interface HeroBannerProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
}

export const HeroBanner = ({ products, onSelectProduct }: HeroBannerProps) => {
  // Tạo mảng kép để băng chuyền chạy vô tận
  const marqueeItems = [...products, ...products];

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[#3d291e] bg-gradient-to-br from-[#231913] to-[#17110c] p-6 text-white shadow-2xl md:p-8">
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-10">
        
        {/* Cột trái (3 phần): Slogan */}
        <div className="z-10 space-y-4 lg:col-span-3">
          <div className="inline-flex items-center space-x-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-wider text-amber-300 backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            <span>HẠT MỘC CẦU ĐẤT • SGU CAMPUS</span>
          </div>

          <div className="space-y-1 border-l-2 border-amber-400/80 py-0.5 pl-3.5">
            <h2 className="text-2xl font-black leading-snug tracking-tight text-white sm:text-3xl">
              Ly nước đắng từ gốc,
            </h2>
            <div className="font-serif italic text-xl text-amber-300 sm:text-2xl">
              cuộc đời ngọt tại tâm.
            </div>
          </div>

          <p className="text-xs font-light leading-relaxed text-[#d4c5b5]">
            Chắt lọc từng mẻ hạt mộc rang vừa, giữ trọn nhiệt độ vàng 70°C bên lò sưởi trao tận tay bạn.
          </p>

          <div className="flex items-center space-x-2 pt-1 text-[11px] text-[#e5dcd2]">
            <span className="inline-flex items-center space-x-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-amber-300 font-medium">
              <span>🔥</span><span>Ủ ấm 70°C</span>
            </span>
            <span className="inline-flex items-center space-x-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-sky-300 font-medium">
              <span>❄️</span><span>Ủ lạnh 16h</span>
            </span>
          </div>
        </div>

        {/* Cột phải (7 phần): Kinetic Continuous Reel */}
        <div className="relative w-full overflow-hidden py-1 lg:col-span-7">
          <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-20 hidden w-12 bg-gradient-to-r from-[#231913] to-transparent sm:block" />
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-20 hidden w-12 bg-gradient-to-l from-[#17110c] to-transparent sm:block" />

          <div className="flex w-max animate-[smoothMarquee_34s_linear_infinite] items-stretch space-x-4 hover:[animation-play-state:paused]">
            {marqueeItems.map((p, idx) => (
              <div
                key={`${p.id}-${idx}`}
                onClick={() => onSelectProduct(p)}
                className="group flex w-[280px] shrink-0 cursor-pointer flex-col justify-between overflow-hidden rounded-3xl border border-[#422d20] bg-[#1c1510]/95 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/80"
              >
                <div>
                  <div className="relative h-44 w-full overflow-hidden">
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="280px"
                    />
                    <span className="absolute left-2.5 top-2.5 rounded-full border border-amber-500/40 bg-black/75 px-2.5 py-1 text-[9px] font-extrabold text-[#fcd34d] backdrop-blur-md">
                      {p.sku}
                    </span>
                  </div>

                  <div className="space-y-1.5 p-4">
                    <h4 className="line-clamp-1 font-bold text-sm text-white transition-colors group-hover:text-amber-300">
                      {p.name}
                    </h4>
                    <p className="line-clamp-2 text-[11px] text-[#d4c5b5] leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#2e1f15] p-4 pt-3">
                  <div>
                    <span className="block text-[9px] font-semibold uppercase text-[#9c897c]">Giá từ</span>
                    <span className="font-mono text-sm font-black text-[#fcd34d]">
                      {p.basePrice.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <span className="rounded-xl bg-[#d97706] px-3 py-1.5 text-xs font-bold text-white shadow-md">
                    Chi Tiết →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};