import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const api = process.env.E2E_API_URL ?? "http://localhost:3101/api/v1";

test("barista processes a real paid order and views read-only inventory on desktop/mobile", async ({
  page,
  request,
}) => {
  const login = await request.post(`${api}/auth/login`, {
    data: {
      username: "barista01",
      password: "Barista@123",
    },
  });
  expect(login.ok()).toBeTruthy();
  const staff = (await login.json()).data.accessToken;
  const registered = await request.post(`${api}/auth/register`, {
    data: {
      username: `staff_e2e_${randomUUID().slice(0, 12)}`,
      password: "Customer-e2e-password",
    },
  });
  const customer = (await registered.json()).data.accessToken;
  const menu = (await (await request.get(`${api}/products`)).json()).data;
  const variant = menu
    .flatMap(
      (p: { variants: { id: string; available: boolean }[] }) =>
        p.variants,
    )
    .find((v: { available: boolean }) => v.available);
  expect(variant).toBeTruthy();
  const created = await request.post(`${api}/orders`, {
    headers: { Authorization: `Bearer ${customer}` },
    data: {
      items: [
        {
          productVariantId: variant.id,
          quantity: 1,
          sugarLevel: 25,
          iceLevel: 50,
          note: "Pha cẩn thận cho khách",
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const order = (await created.json()).data;
  const paid = await request.post(`${api}/payments`, {
    headers: {
      Authorization: `Bearer ${customer}`,
      "Idempotency-Key": randomUUID(),
    },
    data: { orderId: order.id, method: "E_WALLET" },
  });
  expect(paid.ok()).toBeTruthy();
  await page.goto("/login");
  await page.evaluate(
    (token) => localStorage.setItem("brewlite_token", token),
    staff,
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/barista");
  const card = page.getByRole("article", {
    name: `Đơn ${order.orderNumber}`,
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect(card).toContainText("25%");
  await expect(card).toContainText("Pha cẩn thận cho khách");
  await page.screenshot({
    path: "../../.tmp/barista-desktop.png",
    fullPage: true,
  });
  for (const label of ["Nhận đơn", "Pha xong", "Đã giao khách"]) {
    await card.getByRole("button", { name: label, exact: true }).click();
    if (label !== "Đã giao khách")
      await expect(
        card.getByRole("button", {
          name: label === "Nhận đơn" ? "Pha xong" : "Đã giao khách",
          exact: true,
        }),
      ).toBeEnabled();
  }
  await expect(card).toHaveCount(0);
  const detail = await request.get(`${api}/orders/${order.id}`, {
    headers: { Authorization: `Bearer ${customer}` },
  });
  expect((await detail.json()).data.status).toBe("COMPLETED");
  await page
    .getByRole("button", { name: "Kho nguyên liệu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Danh sách nguyên liệu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cập nhật", exact: true }),
  ).toHaveCount(0);
  const stock = (
    await (
      await request.get(`${api}/staff/inventory`, {
        headers: { Authorization: `Bearer ${staff}` },
      })
    ).json()
  ).data[0];
  const denied = await request.patch(
    `${api}/staff/inventory/${stock.id}/stock`,
    {
      headers: { Authorization: `Bearer ${staff}` },
      data: { stockQuantity: 0, version: stock.version },
    },
  );
  expect(denied.status()).toBe(403);
  await page.screenshot({
    path: "../../.tmp/inventory-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Danh sách nguyên liệu" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../.tmp/inventory-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Hàng đợi đơn", exact: true }).click();
  await page.screenshot({
    path: "../../.tmp/barista-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // A CUSTOMER never receives the employee interface.
  await page.evaluate(
    (token) => localStorage.setItem("brewlite_token", token),
    customer,
  );
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "không có quyền" }),
  ).toContainText("không có quyền");
  const forbidden = await request.get(`${api}/staff/inventory`, {
    headers: { Authorization: `Bearer ${customer}` },
  });
  expect(forbidden.status()).toBe(403);
});
