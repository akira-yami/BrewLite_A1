'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { requestOrderRefundApi } from '../api';
import type { OrderDetail } from '../types';

export function OrderRefundPanel({ order, token }: { order: OrderDetail; token: string }) {
  const [confirming, setConfirming] = useState(false);
  const client = useQueryClient();
  const queryKey = ['order-detail', token, order.id];
  const refund = useMutation({
    mutationFn: () => requestOrderRefundApi(token, order.id),
    onSuccess: async (refundRequest) => {
      await client.cancelQueries({ queryKey });
      client.setQueryData<OrderDetail>(queryKey, (detail) => detail && { ...detail, refundRequest });
      setConfirming(false);
      await client.invalidateQueries({ queryKey });
    },
    onError: () => client.invalidateQueries({ queryKey }),
  });

  const request = order.refundRequest;
  if (order.status !== 'PAID' && !request && !refund.isError) return null;

  const points = (request?.points ?? order.total).toLocaleString('vi-VN');

  return (
    <section aria-labelledby="order-refund-title" className="mt-5 rounded-2xl border border-[#E8DFC8] bg-white p-5 text-sm sm:p-6">
      <h2 id="order-refund-title" className="font-serif text-lg font-bold text-[#163D2C]">Hoàn tiền qua điểm Loyalty</h2>

      {request?.status === 'PENDING' && (
        <div role="status" className="mt-3 rounded-xl bg-amber-50 p-4 text-amber-900">
          <p className="font-bold">Đang chờ barista duyệt</p>
          <p className="mt-1">Đơn tạm dừng pha chế trong lúc quầy xem xét. Bạn sẽ nhận {points} điểm Loyalty nếu yêu cầu được duyệt.</p>
        </div>
      )}
      {request?.status === 'APPROVED' && (
        <div role="status" className="mt-3 rounded-xl bg-emerald-50 p-4 text-emerald-900">
          <p className="font-bold">Đã hoàn {points} điểm Loyalty</p>
          <p className="mt-1">Đơn đã được hủy. Điểm thưởng tích lũy từ đơn này đã được thu hồi.</p>
          <Link href="/loyalty" className="mt-2 inline-block font-bold underline">Xem lịch sử điểm Loyalty</Link>
        </div>
      )}
      {request?.status === 'REJECTED' && (
        <div role="status" className="mt-3 rounded-xl bg-rose-50 p-4 text-rose-900">
          <p className="font-bold">Yêu cầu hoàn tiền bị từ chối</p>
          <p className="mt-1 break-words">{request.rejectionReason}</p>
        </div>
      )}

      {!request && order.status === 'PAID' && (
        <>
          <p className="mt-2 text-[#756A63]">
            Gửi yêu cầu trước khi quầy nhận pha chế. Nếu được duyệt, đơn sẽ bị hủy và bạn nhận <strong>{points} điểm Loyalty</strong> theo tỷ lệ 1 đ = 1 điểm.
          </p>
          {confirming ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={refund.isPending} onClick={() => refund.mutate()} className="rounded-full bg-[#163D2C] px-4 py-2 font-bold text-white disabled:opacity-50">
                {refund.isPending ? 'Đang gửi…' : 'Xác nhận gửi yêu cầu'}
              </button>
              <button type="button" disabled={refund.isPending} onClick={() => { setConfirming(false); refund.reset(); }} className="rounded-full border border-[#D8CCBA] px-4 py-2 font-bold text-[#163D2C] disabled:opacity-50">
                Giữ đơn
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="mt-4 rounded-full border border-[#D8CCBA] px-4 py-2 font-bold text-[#163D2C]">
              Yêu cầu hoàn tiền
            </button>
          )}
        </>
      )}

      {refund.isError && <p role="alert" className="mt-3 text-rose-700">{refund.error.message}</p>}
    </section>
  );
}
