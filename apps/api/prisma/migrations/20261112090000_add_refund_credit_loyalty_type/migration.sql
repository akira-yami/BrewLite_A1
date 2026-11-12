-- AlterEnum: Thêm loại giao dịch REFUND_CREDIT vào LoyaltyTransactionType
-- Dùng để ghi nhận khoản hoàn tiền dưới dạng điểm tích lũy khi hủy đơn PAID.
ALTER TYPE "LoyaltyTransactionType" ADD VALUE IF NOT EXISTS 'REFUND_CREDIT';
