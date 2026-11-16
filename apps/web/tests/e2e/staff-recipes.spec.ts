import { expect, test } from '@playwright/test';
import { createTestUser } from './helpers/auth-helper';

const api = process.env.E2E_API_URL ?? 'http://localhost:3101/api/v1';

test('shows a login prompt to guests and denies customer access to recipes', async ({ page, request }) => {
  await page.goto('/barista/recipes');
  await expect(page.getByText('Vui lòng đăng nhập bằng tài khoản Barista để xem công thức.')).toBeVisible();

  const customer = await createTestUser(request, api, 'e2e_recipes');
  await page.goto('/login');
  await page.evaluate(token => localStorage.setItem('brewlite_token', token), customer.accessToken);
  await page.goto('/barista/recipes');

  await expect(page.getByRole('main').getByRole('alert'))
    .toHaveText('Bạn không có quyền xem công thức đồ uống.');
  await expect(page.getByRole('searchbox', { name: 'Tìm đồ uống' })).toHaveCount(0);
});

test('barista searches recipes without accents and sees quantities by size and topping', async ({ page, request }) => {
  const login = await request.post(`${api}/auth/login`, {
    data: { username: 'barista01', password: 'Barista@123' },
  });
  expect(login.ok()).toBeTruthy();
  const { data: { accessToken } } = await login.json();
  await page.goto('/login');
  await page.evaluate(token => localStorage.setItem('brewlite_token', token), accessToken);
  await page.goto('/barista/recipes');

  const search = page.getByRole('searchbox', { name: 'Tìm đồ uống' });
  await search.fill('ca phe sua cau dat');
  const recipes = page.getByRole('region', { name: 'Danh sách công thức đồ uống' });
  await expect(recipes.getByRole('article')).toHaveCount(1);
  const recipe = recipes.getByRole('article');
  await expect(recipe.getByRole('heading', { name: 'Cà phê sữa Cầu Đất' })).toBeVisible();
  const small = recipe.locator('section').filter({ has: page.getByRole('heading', { name: 'Cỡ S', exact: true }) });
  await expect(small.getByText('Cà phê rang xay Cầu Đất')).toBeVisible();
  await expect(small.getByText('15 g', { exact: true })).toBeVisible();

  await recipe.getByText(/^Topping \(\d+\)$/).click();
  await expect(recipe.getByRole('heading', { name: 'Trân châu trắng tuyết hoa' })).toBeVisible();
  await search.fill('COFFEE-CAU-DAT-01');
  await expect(recipe.getByRole('heading', { name: 'Cà phê sữa Cầu Đất' })).toBeVisible();
  await search.fill('no-matching-recipe');
  await expect(recipes.getByText('Không tìm thấy đồ uống phù hợp.')).toBeVisible();
});
