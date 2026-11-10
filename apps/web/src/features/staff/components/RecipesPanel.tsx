import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getStaffRecipesApi } from "../api";
import type { RecipeIngredient } from "../types";
import { StaffIcon } from "./StaffIcon";

const unitLabels = { G: "g", ML: "ml", PCS: "cái" };

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");
}

function IngredientList({ ingredients }: { ingredients: RecipeIngredient[] }) {
  if (ingredients.length === 0) {
    return <p className="mt-2 text-sm text-[#6D786F]">Chưa có định lượng.</p>;
  }

  return (
    <ul className="mt-2 divide-y divide-[#DEE3D8] text-sm">
      {ingredients.map((ingredient) => (
        <li key={ingredient.id} className="flex justify-between gap-3 py-2">
          <span className="min-w-0 break-words">
            {ingredient.name}
            {!ingredient.isActive && (
              <span className="block text-xs text-amber-800">
                Ngừng sử dụng
              </span>
            )}
          </span>
          <span className="shrink-0 font-semibold tabular-nums">
            {ingredient.quantity.toLocaleString("vi-VN")}{" "}
            {unitLabels[ingredient.unit]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RecipesPanel({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const recipes = useQuery({
    queryKey: ["staff-recipes", token],
    queryFn: ({ signal }) => getStaffRecipesApi(token, signal),
    retry: false,
  });

  if (recipes.isPending) {
    return (
      <p role="status" className="rounded-2xl bg-white p-8 text-center text-sm">
        Đang tải công thức…
      </p>
    );
  }

  if (recipes.isError) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800"
      >
        <p>Không thể tải công thức đồ uống.</p>
        <button
          type="button"
          onClick={() => void recipes.refetch()}
          className="mt-3 font-semibold underline"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (recipes.data.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-sm">
        Chưa có đồ uống để tra cứu.
      </p>
    );
  }

  const query = normalizeSearch(search.trim());
  const matches = recipes.data.filter(({ name, sku }) =>
    normalizeSearch(`${name} ${sku}`).includes(query),
  );

  return (
    <section aria-label="Danh sách công thức đồ uống">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex w-full items-center gap-2 rounded-xl border border-[#DDE2D7] bg-white px-3 focus-within:border-[#527353] sm:max-w-sm">
          <StaffIcon name="search" width="17" height="17" />
          <input
            type="search"
            aria-label="Tìm đồ uống"
            placeholder="Tìm theo tên hoặc mã đồ uống…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full min-w-0 py-3 text-sm outline-none"
          />
        </label>
        <p role="status" className="text-sm text-[#6D786F]">
          {matches.length} món
        </p>
      </div>

      {matches.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-sm">
          Không tìm thấy đồ uống phù hợp.
        </p>
      )}

      <div className="space-y-4">
        {matches.map((recipe) => (
          <article
            key={recipe.id}
            className="rounded-2xl border border-[#DEE3D8] bg-white p-5 sm:p-6"
          >
            <header className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EDF1E7] text-[#527353]">
                <StaffIcon name="coffee" width="18" height="18" />
              </span>
              <div className="min-w-0 break-words">
                <h2 className="font-serif text-xl font-semibold">
                  {recipe.name}
                </h2>
                <p className="mt-0.5 text-xs text-[#6D786F]">{recipe.sku}</p>
              </div>
            </header>

            {recipe.variants.length === 0 ? (
              <p className="text-sm text-[#6D786F]">
                Chưa có cỡ ly đang phục vụ.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recipe.variants.map((variant) => (
                  <section
                    key={variant.id}
                    className="min-w-0 rounded-xl bg-[#F3F5EF] px-4 py-3"
                  >
                    <h3 className="text-sm font-bold">Cỡ {variant.size}</h3>
                    <IngredientList ingredients={variant.ingredients} />
                  </section>
                ))}
              </div>
            )}

            {recipe.toppings.length > 0 && (
              <details className="mt-4 border-t border-[#DEE3D8] pt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Topping ({recipe.toppings.length})
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recipe.toppings.map((topping) => (
                    <section
                      key={topping.id}
                      className="min-w-0 rounded-xl bg-[#F3F5EF] px-4 py-3"
                    >
                      <h3 className="break-words text-sm font-bold">
                        {topping.name}
                      </h3>
                      <IngredientList ingredients={topping.ingredients} />
                    </section>
                  ))}
                </div>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
