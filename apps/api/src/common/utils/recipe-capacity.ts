export interface RecipeLine {
  /** Lượng nguyên liệu (đơn vị cơ sở) cần cho 1 ly. */
  quantity: number;
  ingredient: { stockQuantity: number; isActive: boolean };
}

/** Availability of one serving from a shared ingredient pool, not size stock.
 * Final basket validation aggregates every recipe/topping before reservation. */
export function canPrepare(recipe: readonly RecipeLine[]): boolean {
  return recipe.length > 0 && recipe.every(line =>
    line.ingredient.isActive && line.quantity > 0 && line.ingredient.stockQuantity >= line.quantity);
}
