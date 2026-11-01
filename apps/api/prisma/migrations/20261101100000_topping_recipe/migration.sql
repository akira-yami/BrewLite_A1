-- Topping không có số lượng tĩnh; mỗi phần topping tiêu hao nguyên liệu theo công thức.
--   PREPACKAGED (nhập sẵn): 1 phần = đúng 1 dòng công thức (ví dụ 30g trân châu 3Q).
--   PREPARED (chế biến): bán thành phẩm, 1 phần = nhiều nguyên liệu thô.
-- Quy tắc "PREPACKAGED có đúng 1 dòng công thức" được kiểm tra ở tầng ứng dụng/seed.
--
-- Lưu ý dữ liệu: topping hiện có mặc định là PREPACKAGED và chưa có công thức nên bị
-- coi là hết hàng cho tới khi có công thức. Chạy `npm run db:seed` để bổ sung công thức mẫu.

-- CreateEnum
CREATE TYPE "ToppingType" AS ENUM ('PREPACKAGED', 'PREPARED');

-- AlterTable
ALTER TABLE "toppings" ADD COLUMN "type" "ToppingType" NOT NULL DEFAULT 'PREPACKAGED';

-- Hai topping mẫu của seed được pha chế từ nhiều nguyên liệu, không phải hàng nhập sẵn.
UPDATE "toppings" SET "type" = 'PREPARED' WHERE "code" IN ('TOP_CHEESE', 'TOP_ESPRESSO');

-- CreateTable
CREATE TABLE "topping_recipe_items" (
    "topping_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "topping_recipe_items_pkey" PRIMARY KEY ("topping_id","ingredient_id")
);

-- CreateIndex
CREATE INDEX "topping_recipe_items_ingredient_id_idx" ON "topping_recipe_items"("ingredient_id");

-- AddForeignKey
ALTER TABLE "topping_recipe_items" ADD CONSTRAINT "topping_recipe_items_topping_id_fkey" FOREIGN KEY ("topping_id") REFERENCES "toppings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topping_recipe_items" ADD CONSTRAINT "topping_recipe_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "topping_recipe_items" ADD CONSTRAINT "topping_recipe_items_quantity_positive"
  CHECK ("quantity" > 0);
