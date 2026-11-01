-- Thành phẩm (ly cà phê, trà sữa...) không có số lượng tĩnh trong CSDL.
-- Tồn kho được lưu ở nguyên liệu thô; số ly tối đa được tính từ công thức (BOM).
--
-- Lưu ý dữ liệu: cột product_variants.stock / version bị xóa. Số lượng thành phẩm
-- cũ không có nghĩa nghiệp vụ nên không được chuyển đổi sang nguyên liệu. Sau khi
-- migrate hãy chạy `npm run db:seed` (hoặc nhập nguyên liệu + công thức qua quản trị)
-- để mỗi variant có công thức; variant chưa có công thức được coi là hết hàng.
-- Các reservation ACTIVE tạo trước migration không có dòng nguyên liệu nên khi
-- hủy/hết hạn sẽ không hoàn kho nguyên liệu (chỉ đổi trạng thái).

-- CreateEnum
CREATE TYPE "IngredientUnit" AS ENUM ('G', 'ML', 'PCS');

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "unit" "IngredientUnit" NOT NULL,
    "stock_quantity" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "product_variant_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("product_variant_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "inventory_reservation_items" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "inventory_reservation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_code_key" ON "ingredients"("code");

-- CreateIndex
CREATE INDEX "recipe_items_ingredient_id_idx" ON "recipe_items"("ingredient_id");

-- CreateIndex
CREATE INDEX "inventory_reservation_items_ingredient_id_idx" ON "inventory_reservation_items"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservation_items_reservation_id_ingredient_id_key" ON "inventory_reservation_items"("reservation_id", "ingredient_id");

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservation_items" ADD CONSTRAINT "inventory_reservation_items_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "inventory_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservation_items" ADD CONSTRAINT "inventory_reservation_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ràng buộc dữ liệu cho các bảng mới.
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_values_valid"
  CHECK ("stock_quantity" >= 0 AND "version" >= 0);
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_quantity_positive"
  CHECK ("quantity" > 0);
ALTER TABLE "inventory_reservation_items" ADD CONSTRAINT "inventory_reservation_items_quantity_positive"
  CHECK ("quantity" > 0);

-- Xóa số lượng thành phẩm khỏi product_variants.
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_values_valid";
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_nonnegative"
  CHECK ("price" >= 0);
ALTER TABLE "product_variants" DROP COLUMN "stock";
ALTER TABLE "product_variants" DROP COLUMN "version";
