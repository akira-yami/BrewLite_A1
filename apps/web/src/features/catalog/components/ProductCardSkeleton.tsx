export const ProductCardSkeleton = () => (
  <div className="flex flex-col justify-between rounded-3xl border border-[#E5DCD2] bg-white p-0 overflow-hidden shadow-sm animate-pulse">
    <div className="h-52 w-full bg-[#E5DCD2]/60" />
    <div className="p-5 space-y-3">
      <div className="h-6 w-3/4 bg-[#E5DCD2]/70 rounded-lg" />
      <div className="space-y-1.5">
        <div className="h-3.5 w-full bg-[#E5DCD2]/50 rounded" />
        <div className="h-3.5 w-5/6 bg-[#E5DCD2]/50 rounded" />
      </div>
    </div>
    <div className="flex items-center justify-between border-t border-[#FAF6F2] p-5 pt-3">
      <div className="h-5 w-20 bg-[#E5DCD2]/70 rounded" />
      <div className="h-9 w-24 bg-[#E5DCD2]/70 rounded-xl" />
    </div>
  </div>
);