export interface RecipeLine {
  /** Lượng nguyên liệu (đơn vị cơ sở) cần cho 1 ly. */
  quantity: number;
  ingredient: { stockQuantity: number; isActive: boolean };
}

/**
 * Số ly tối đa làm được từ công thức (BOM) và tồn kho nguyên liệu hiện tại.
 * Đây là giá trị tính toán, không được lưu trong CSDL.
 * Món không có công thức hoặc có nguyên liệu ngừng dùng được coi là 0.
 */
export function maxServings(recipe: readonly RecipeLine[]): number {
  if (recipe.length === 0) return 0;
  let max = Number.POSITIVE_INFINITY;
  for (const line of recipe) {
    if (!line.ingredient.isActive || line.quantity <= 0) return 0;
    max = Math.min(max, Math.floor(line.ingredient.stockQuantity / line.quantity));
  }
  return Math.max(0, max);
}
