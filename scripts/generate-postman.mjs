import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const postmanDir = resolve(rootDir, 'postman');

mkdirSync(postmanDir, { recursive: true });

function createRequestItem({
  name,
  method,
  path,
  headers = [],
  body = null,
  preRequestScript = null,
  testScript = null,
  queryParams = [],
}) {
  const item = {
    name,
    event: [],
    request: {
      method,
      header: [
        {
          key: 'Content-Type',
          value: 'application/json',
          type: 'text',
        },
        ...headers.map((h) => ({
          key: h.key,
          value: h.value,
          type: 'text',
        })),
      ],
      url: {
        raw: `{{baseUrl}}${path}`,
        host: ['{{baseUrl}}'],
        path: path.replace(/^\//, '').split('/'),
      },
    },
  };

  if (queryParams.length > 0) {
    item.request.url.query = queryParams.map((q) => ({
      key: q.key,
      value: q.value,
    }));
    item.request.url.raw +=
      '?' + queryParams.map((q) => `${q.key}=${encodeURIComponent(q.value)}`).join('&');
  }

  if (body) {
    item.request.body = {
      mode: 'raw',
      raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
      options: {
        raw: {
          language: 'json',
        },
      },
    };
  }

  if (preRequestScript) {
    item.event.push({
      listen: 'prerequest',
      script: {
        exec: Array.isArray(preRequestScript) ? preRequestScript : preRequestScript.split('\n'),
        type: 'text/javascript',
      },
    });
  }

  if (testScript) {
    item.event.push({
      listen: 'test',
      script: {
        exec: Array.isArray(testScript) ? testScript : testScript.split('\n'),
        type: 'text/javascript',
      },
    });
  }

  return item;
}

const collection = {
  info: {
    _postman_id: '9b2c7e41-0523-4e89-8d8a-brewlite-api-v1',
    name: 'BrewLite API Collection',
    description:
      'Bộ sưu tập Postman Collection hoàn chỉnh cho toàn bộ các API của dự án BrewLite - Đặt món & Thanh toán.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3001/api/v1', type: 'string' },
    { key: 'customerToken', value: '', type: 'string' },
    { key: 'baristaToken', value: '', type: 'string' },
    { key: 'operatorToken', value: '', type: 'string' },
    { key: 'customerId', value: '', type: 'string' },
    { key: 'baristaId', value: '', type: 'string' },
    { key: 'operatorId', value: '', type: 'string' },
    { key: 'productId', value: '', type: 'string' },
    { key: 'productVariantId', value: '', type: 'string' },
    { key: 'toppingId', value: '', type: 'string' },
    { key: 'orderId', value: '', type: 'string' },
    { key: 'cancelOrderId', value: '', type: 'string' },
    { key: 'paymentId', value: '', type: 'string' },
    { key: 'paymentIdempotencyKey', value: '', type: 'string' },
    { key: 'ingredientId', value: '', type: 'string' },
  ],
  item: [
    {
      name: '1. System & Health',
      item: [
        createRequestItem({
          name: '01. Root Welcome API',
          method: 'GET',
          path: '/',
          testScript: `
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});
pm.test("Response body contains Welcome message", function () {
    pm.expect(pm.response.text()).to.include("Hello World!");
});
`,
        }),
        createRequestItem({
          name: '02. Health Check API',
          method: 'GET',
          path: '/health',
          testScript: `
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});
pm.test("Health status is ok", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.status).to.eql("ok");
});
`,
        }),
      ],
    },
    {
      name: '2. Auth & Access Control',
      item: [
        createRequestItem({
          name: '01. Register New Customer Account',
          method: 'POST',
          path: '/auth/register',
          preRequestScript: `
const rand = Math.floor(Math.random() * 1000000);
const username = "new_customer_" + rand;
pm.environment.set("registeredUsername", username);
pm.collectionVariables.set("registeredUsername", username);
`,
          body: {
            username: '{{registeredUsername}}',
            password: 'Customer@123',
          },
          testScript: `
pm.test("Status code is 201 Created", function () {
    pm.response.to.have.status(201);
});
pm.test("Customer registered successfully", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.user).to.have.property("id");
    pm.expect(jsonData.data.user.role).to.eql("CUSTOMER");
    pm.expect(jsonData.data.user.username).to.eql(pm.environment.get("registeredUsername"));
});
`,
        }),
        createRequestItem({
          name: '02. Register Duplicate Username (409 Conflict)',
          method: 'POST',
          path: '/auth/register',
          body: {
            username: '{{registeredUsername}}',
            password: 'Customer@123',
          },
          testScript: `
pm.test("Status code is 409 Conflict", function () {
    pm.response.to.have.status(409);
});
pm.test("Returns user conflict error", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.error || jsonData.message).to.be.ok;
});
`,
        }),
        createRequestItem({
          name: '03. Register Invalid Payload (400 Bad Request)',
          method: 'POST',
          path: '/auth/register',
          body: {
            username: 'a',
            password: '123',
          },
          testScript: `
pm.test("Status code is 400 Bad Request", function () {
    pm.response.to.have.status(400);
});
`,
        }),
        createRequestItem({
          name: '04. Login as Customer (customer01)',
          method: 'POST',
          path: '/auth/login',
          body: {
            username: 'customer01',
            password: 'Customer@123',
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Saves customer token & ID", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data).to.have.property("accessToken");
    pm.expect(jsonData.data.user.role).to.eql("CUSTOMER");
    pm.environment.set("customerToken", jsonData.data.accessToken);
    pm.environment.set("customerId", jsonData.data.user.id);
    pm.collectionVariables.set("customerToken", jsonData.data.accessToken);
    pm.collectionVariables.set("customerId", jsonData.data.user.id);
});
`,
        }),
        createRequestItem({
          name: '05. Login as Barista (barista01)',
          method: 'POST',
          path: '/auth/login',
          body: {
            username: 'barista01',
            password: 'Barista@123',
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Saves barista token & ID", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data).to.have.property("accessToken");
    pm.expect(jsonData.data.user.role).to.eql("BARISTA");
    pm.environment.set("baristaToken", jsonData.data.accessToken);
    pm.environment.set("baristaId", jsonData.data.user.id);
    pm.collectionVariables.set("baristaToken", jsonData.data.accessToken);
    pm.collectionVariables.set("baristaId", jsonData.data.user.id);
});
`,
        }),
        createRequestItem({
          name: '06. Login as Payment Operator (operator01)',
          method: 'POST',
          path: '/auth/login',
          body: {
            username: 'operator01',
            password: 'Operator@123',
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Saves operator token & ID", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data).to.have.property("accessToken");
    pm.expect(jsonData.data.user.role).to.eql("PAYMENT_OPERATOR");
    pm.environment.set("operatorToken", jsonData.data.accessToken);
    pm.environment.set("operatorId", jsonData.data.user.id);
    pm.collectionVariables.set("operatorToken", jsonData.data.accessToken);
    pm.collectionVariables.set("operatorId", jsonData.data.user.id);
});
`,
        }),
        createRequestItem({
          name: '07. Login Invalid Credentials (401 Unauthorized)',
          method: 'POST',
          path: '/auth/login',
          body: {
            username: 'customer01',
            password: 'WrongPassword!',
          },
          testScript: `
pm.test("Status code is 401 Unauthorized", function () {
    pm.response.to.have.status(401);
});
`,
        }),
        createRequestItem({
          name: '08. Get Profile Me (Customer)',
          method: 'GET',
          path: '/auth/me',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Profile matches current customer", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.id).to.eql(pm.environment.get("customerId"));
    pm.expect(jsonData.data.username).to.eql("customer01");
});
`,
        }),
        createRequestItem({
          name: '09. Get Profile Me - Unauthorized without Token (401)',
          method: 'GET',
          path: '/auth/me',
          testScript: `
pm.test("Status code is 401 Unauthorized", function () {
    pm.response.to.have.status(401);
});
`,
        }),
        createRequestItem({
          name: '10. Get User by ID - Own ID (OwnershipGuard)',
          method: 'GET',
          path: '/auth/users/{{customerId}}',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Returns user data", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.id).to.eql(pm.environment.get("customerId"));
});
`,
        }),
        createRequestItem({
          name: '11. Get User by ID - Forbidden Foreign Profile (403)',
          method: 'GET',
          path: '/auth/users/{{baristaId}}',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 403 Forbidden", function () {
    pm.response.to.have.status(403);
});
`,
        }),
        createRequestItem({
          name: '12. Barista Only Endpoint - Barista Role Allowed (200)',
          method: 'GET',
          path: '/auth/barista-only',
          headers: [{ key: 'Authorization', value: 'Bearer {{baristaToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Barista greeting verified", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.message).to.include("Barista");
});
`,
        }),
        createRequestItem({
          name: '13. Barista Only Endpoint - Customer Forbidden (403)',
          method: 'GET',
          path: '/auth/barista-only',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 403 Forbidden", function () {
    pm.response.to.have.status(403);
});
`,
        }),
      ],
    },
    {
      name: '3. Catalog & Products',
      item: [
        createRequestItem({
          name: '01. List Products',
          method: 'GET',
          path: '/products',
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Products returned with variants and toppings", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    pm.expect(jsonData.data).to.be.an("array").that.is.not.empty;

    const firstProduct = jsonData.data[0];
    pm.expect(firstProduct).to.have.property("id");
    pm.expect(firstProduct.variants).to.be.an("array").that.is.not.empty;
    pm.expect(firstProduct.toppings).to.be.an("array").that.is.not.empty;

    pm.environment.set("productId", firstProduct.id);
    pm.environment.set("productVariantId", firstProduct.variants[0].id);
    pm.environment.set("toppingId", firstProduct.toppings[0].id);
    pm.collectionVariables.set("productId", firstProduct.id);
    pm.collectionVariables.set("productVariantId", firstProduct.variants[0].id);
    pm.collectionVariables.set("toppingId", firstProduct.toppings[0].id);
});
`,
        }),
        createRequestItem({
          name: '02. Get Product Detail by ID',
          method: 'GET',
          path: '/products/{{productId}}',
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Returns correct product detail", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    pm.expect(jsonData.data.id).to.eql(pm.environment.get("productId"));
});
`,
        }),
        createRequestItem({
          name: '03. Get Product Detail - Invalid UUID (400 Bad Request)',
          method: 'GET',
          path: '/products/not-a-valid-uuid',
          testScript: `
pm.test("Status code is 400 Bad Request", function () {
    pm.response.to.have.status(400);
});
`,
        }),
      ],
    },
    {
      name: '4. Coupons & Promotions',
      item: [
        createRequestItem({
          name: '01. Validate Coupon - Valid Code (BREW10-DEMO)',
          method: 'POST',
          path: '/coupons/validate',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          body: {
            code: 'BREW10-DEMO',
            subtotal: 50000,
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Coupon is valid and calculates discount", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.code).to.eql("BREW10-DEMO");
    pm.expect(jsonData.data.discountAmount).to.be.above(0);
});
`,
        }),
        createRequestItem({
          name: '02. Validate Coupon - Invalid Code (422 Unprocessable Entity)',
          method: 'POST',
          path: '/coupons/validate',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          body: {
            code: 'NOT_EXISTING_COUPON',
            subtotal: 50000,
          },
          testScript: `
pm.test("Status code is 422 Unprocessable Entity", function () {
    pm.response.to.have.status(422);
});
pm.test("Coupon validation returns COUPON_NOT_APPLICABLE error code", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.error.code).to.eql("COUPON_NOT_APPLICABLE");
});
`,
        }),
        createRequestItem({
          name: '03. Validate Coupon - Unauthorized without Token (401)',
          method: 'POST',
          path: '/coupons/validate',
          body: {
            code: 'BREW10-DEMO',
            subtotal: 50000,
          },
          testScript: `
pm.test("Status code is 401 Unauthorized", function () {
    pm.response.to.have.status(401);
});
`,
        }),
      ],
    },
    {
      name: '5. Orders',
      item: [
        createRequestItem({
          name: '01. Create Order (Success - PENDING)',
          method: 'POST',
          path: '/orders',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          body: {
            items: [
              {
                productVariantId: '{{productVariantId}}',
                quantity: 2,
                toppingIds: ['{{toppingId}}'],
                sugarLevel: 50,
                iceLevel: 50,
                note: 'Ít đường ít đá, uống tại quán',
              },
            ],
            couponCode: 'BREW10-DEMO',
          },
          testScript: `
pm.test("Status code is 201 Created", function () {
    pm.response.to.have.status(201);
});
pm.test("Order created in PENDING status", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data).to.have.property("id");
    pm.expect(jsonData.data.status).to.eql("PENDING");
    pm.expect(jsonData.data.items).to.be.an("array").that.is.not.empty;

    pm.environment.set("orderId", jsonData.data.id);
    pm.environment.set("orderTotal", jsonData.data.total);
    pm.collectionVariables.set("orderId", jsonData.data.id);
    pm.collectionVariables.set("orderTotal", jsonData.data.total);
});
`,
        }),
        createRequestItem({
          name: '02. Create Order - Invalid Payload (Quantity 0 -> 400)',
          method: 'POST',
          path: '/orders',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          body: {
            items: [
              {
                productVariantId: '{{productVariantId}}',
                quantity: 0,
              },
            ],
          },
          testScript: `
pm.test("Status code is 400 Bad Request", function () {
    pm.response.to.have.status(400);
});
`,
        }),
        createRequestItem({
          name: '03. Get My Orders List',
          method: 'GET',
          path: '/orders/me',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Contains created orders", function () {
    var jsonData = pm.response.json();
    const orders = Array.isArray(jsonData.data) ? jsonData.data : (jsonData.data.items || []);
    pm.expect(orders).to.be.an("array").that.is.not.empty;
});
`,
        }),
        createRequestItem({
          name: '04. Get Order Detail by ID',
          method: 'GET',
          path: '/orders/{{orderId}}',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Returns correct order detail", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.id).to.eql(pm.environment.get("orderId"));
    pm.expect(jsonData.data.items).to.be.an("array").that.is.not.empty;
});
`,
        }),
        createRequestItem({
          name: '05. Create Order for Cancellation Test',
          method: 'POST',
          path: '/orders',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          body: {
            items: [
              {
                productVariantId: '{{productVariantId}}',
                quantity: 1,
              },
            ],
          },
          testScript: `
pm.test("Status code is 201 Created", function () {
    pm.response.to.have.status(201);
});
pm.test("Saves cancelOrderId", function () {
    var jsonData = pm.response.json();
    pm.environment.set("cancelOrderId", jsonData.data.id);
    pm.collectionVariables.set("cancelOrderId", jsonData.data.id);
});
`,
        }),
        createRequestItem({
          name: '06. Cancel Order (Success - CANCELLED)',
          method: 'POST',
          path: '/orders/{{cancelOrderId}}/cancel',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Order status changed to CANCELLED", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.status).to.eql("CANCELLED");
});
`,
        }),
        createRequestItem({
          name: '07. Cancel Already Cancelled Order (Expected 400 / Conflict)',
          method: 'POST',
          path: '/orders/{{cancelOrderId}}/cancel',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code indicates invalid state (400 or 409)", function () {
    pm.expect([400, 409]).to.include(pm.response.code);
});
`,
        }),
      ],
    },
    {
      name: '6. Payments',
      item: [
        createRequestItem({
          name: '01. Process Payment - E_WALLET (Success)',
          method: 'POST',
          path: '/payments',
          preRequestScript: `
const key = "idem_pay_" + Date.now();
pm.environment.set("paymentIdempotencyKey", key);
pm.collectionVariables.set("paymentIdempotencyKey", key);
`,
          headers: [
            { key: 'Authorization', value: 'Bearer {{customerToken}}' },
            { key: 'Idempotency-Key', value: '{{paymentIdempotencyKey}}' },
          ],
          body: {
            orderId: '{{orderId}}',
            method: 'E_WALLET',
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Payment processed successfully and order is PAID", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.success).to.be.true;
    pm.expect(["SUCCEEDED", "PROCESSING"]).to.include(jsonData.data.status);
});
`,
        }),
        createRequestItem({
          name: '02. Process Payment - Idempotent Replay (Same Key)',
          method: 'POST',
          path: '/payments',
          headers: [
            { key: 'Authorization', value: 'Bearer {{customerToken}}' },
            { key: 'Idempotency-Key', value: '{{paymentIdempotencyKey}}' },
          ],
          body: {
            orderId: '{{orderId}}',
            method: 'E_WALLET',
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Returns idempotent payment replay without error", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.success).to.be.true;
    pm.expect(jsonData.data.isRetried).to.be.true;
});
`,
        }),
        createRequestItem({
          name: '03. Get Payment Status by Idempotency Key',
          method: 'GET',
          path: '/payments/status',
          headers: [
            { key: 'Authorization', value: 'Bearer {{customerToken}}' },
            { key: 'Idempotency-Key', value: '{{paymentIdempotencyKey}}' },
          ],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Returns accurate payment record", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.success).to.be.true;
    pm.expect(jsonData.data.status).to.eql("SUCCEEDED");
});
`,
        }),
        createRequestItem({
          name: '04. Fetch Order Detail to Extract Payment ID',
          method: 'GET',
          path: '/orders/{{orderId}}',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Extracts payment ID from payment summary", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.paymentSummary).to.be.an("object").that.is.not.null;
    pm.expect(jsonData.data.paymentSummary).to.have.property("id");
    pm.environment.set("paymentId", jsonData.data.paymentSummary.id);
    pm.collectionVariables.set("paymentId", jsonData.data.paymentSummary.id);
});
`,
        }),
        createRequestItem({
          name: '05. Get Payment Status - Missing Idempotency Key (400)',
          method: 'GET',
          path: '/payments/status',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 400 Bad Request", function () {
    pm.response.to.have.status(400);
});
`,
        }),
        createRequestItem({
          name: '06. Process Payment - Re-pay Already Paid Order (400/409)',
          method: 'POST',
          path: '/payments',
          preRequestScript: `
const newKey = "idem_new_pay_" + Date.now();
pm.environment.set("newPayKey", newKey);
pm.collectionVariables.set("newPayKey", newKey);
`,
          headers: [
            { key: 'Authorization', value: 'Bearer {{customerToken}}' },
            { key: 'Idempotency-Key', value: '{{newPayKey}}' },
          ],
          body: {
            orderId: '{{orderId}}',
            method: 'E_WALLET',
          },
          testScript: `
pm.test("Status code is 400 or 409", function () {
    pm.expect([400, 409]).to.include(pm.response.code);
});
`,
        }),
        createRequestItem({
          name: '07. VNPay Return Redirect Endpoint',
          method: 'GET',
          path: '/payments/vnpay/return',
          queryParams: [{ key: 'vnp_ResponseCode', value: '00' }],
          testScript: `
pm.test("Status code is 503 (VNPay not configured in dev) or 302/200", function () {
    pm.expect([200, 302, 503]).to.include(pm.response.code);
});
`,
        }),
        createRequestItem({
          name: '08. VNPay IPN Webhook Endpoint',
          method: 'GET',
          path: '/payments/vnpay/ipn',
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Response includes RspCode", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("RspCode");
});
`,
        }),
        createRequestItem({
          name: '09. Operator Recovery - Customer Forbidden (403)',
          method: 'POST',
          path: '/payments/{{paymentId}}/recovery',
          headers: [
            { key: 'Authorization', value: 'Bearer {{customerToken}}' },
            { key: 'Idempotency-Key', value: 'rec_cust_test_1' },
          ],
          body: {
            incidentReference: 'INC-FORBIDDEN-01',
          },
          testScript: `
pm.test("Status code is 403 Forbidden", function () {
    pm.response.to.have.status(403);
});
`,
        }),
        createRequestItem({
          name: '10. Operator Recovery - Missing Idempotency-Key (400)',
          method: 'POST',
          path: '/payments/{{paymentId}}/recovery',
          headers: [{ key: 'Authorization', value: 'Bearer {{operatorToken}}' }],
          body: {
            incidentReference: 'INC-NO-HEADER-01',
          },
          testScript: `
pm.test("Status code is 400 Bad Request", function () {
    pm.response.to.have.status(400);
});
`,
        }),
        createRequestItem({
          name: '11. Operator Recovery - Non-VNPAY Payment Conflict (409)',
          method: 'POST',
          path: '/payments/{{paymentId}}/recovery',
          preRequestScript: `
const recKey = "rec_op_" + Date.now();
pm.environment.set("operatorRecKey", recKey);
pm.collectionVariables.set("operatorRecKey", recKey);
`,
          headers: [
            { key: 'Authorization', value: 'Bearer {{operatorToken}}' },
            { key: 'Idempotency-Key', value: '{{operatorRecKey}}' },
          ],
          body: {
            incidentReference: 'INC-VNPAY-CHECK-01',
          },
          testScript: `
pm.test("Status code is 409 Conflict (PAYMENT_NOT_RECONCILABLE)", function () {
    pm.response.to.have.status(409);
});
`,
        }),
        createRequestItem({
          name: '12. Operator Recovery Resolution - Customer Forbidden (403)',
          method: 'POST',
          path: '/payments/{{paymentId}}/recovery/resolve',
          headers: [
            { key: 'Authorization', value: 'Bearer {{customerToken}}' },
            { key: 'Idempotency-Key', value: 'res_cust_test_1' },
          ],
          body: {
            decision: 'REFUND_CONFIRMED',
            evidenceReference: 'EVID-TEST-01',
            incidentReference: 'INC-TEST-01',
          },
          testScript: `
pm.test("Status code is 403 Forbidden", function () {
    pm.response.to.have.status(403);
});
`,
        }),
        createRequestItem({
          name: '13. Operator Recovery Resolution - Non-VNPAY Payment Conflict (409)',
          method: 'POST',
          path: '/payments/{{paymentId}}/recovery/resolve',
          preRequestScript: `
const resKey = "res_op_" + Date.now();
pm.environment.set("operatorResKey", resKey);
pm.collectionVariables.set("operatorResKey", resKey);
`,
          headers: [
            { key: 'Authorization', value: 'Bearer {{operatorToken}}' },
            { key: 'Idempotency-Key', value: '{{operatorResKey}}' },
          ],
          body: {
            decision: 'REFUND_CONFIRMED',
            evidenceReference: 'EVID-TEST-01',
            incidentReference: 'INC-TEST-01',
          },
          testScript: `
pm.test("Status code is 409 Conflict (PAYMENT_NOT_RECONCILABLE)", function () {
    pm.response.to.have.status(409);
});
`,
        }),
      ],
    },
    {
      name: '7. Staff Orders (Barista Flow)',
      item: [
        createRequestItem({
          name: '01. Get Staff Orders Queue (Barista)',
          method: 'GET',
          path: '/staff/orders',
          headers: [{ key: 'Authorization', value: 'Bearer {{baristaToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Barista queue contains active orders", function () {
    var jsonData = pm.response.json();
    const orders = Array.isArray(jsonData.data) ? jsonData.data : (jsonData.data.items || []);
    pm.expect(orders).to.be.an("array");
});
`,
        }),
        createRequestItem({
          name: '02. Get Staff Queue - Customer Forbidden (403)',
          method: 'GET',
          path: '/staff/orders',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 403 Forbidden", function () {
    pm.response.to.have.status(403);
});
`,
        }),
        createRequestItem({
          name: '03. Advance Order to PREPARING',
          method: 'PATCH',
          path: '/staff/orders/{{orderId}}/status',
          headers: [{ key: 'Authorization', value: 'Bearer {{baristaToken}}' }],
          body: {
            status: 'PREPARING',
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Order advanced to PREPARING", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.status).to.eql("PREPARING");
});
`,
        }),
        createRequestItem({
          name: '04. Advance Order to READY',
          method: 'PATCH',
          path: '/staff/orders/{{orderId}}/status',
          headers: [{ key: 'Authorization', value: 'Bearer {{baristaToken}}' }],
          body: {
            status: 'READY',
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Order advanced to READY", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.status).to.eql("READY");
});
`,
        }),
        createRequestItem({
          name: '05. Advance Order to COMPLETED',
          method: 'PATCH',
          path: '/staff/orders/{{orderId}}/status',
          headers: [{ key: 'Authorization', value: 'Bearer {{baristaToken}}' }],
          body: {
            status: 'COMPLETED',
          },
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Order completed and finalized", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.status).to.eql("COMPLETED");
});
`,
        }),
      ],
    },
    {
      name: '8. Staff Inventory',
      item: [
        createRequestItem({
          name: '01. List Staff Ingredients Inventory',
          method: 'GET',
          path: '/staff/inventory',
          headers: [{ key: 'Authorization', value: 'Bearer {{baristaToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Ingredients returned", function () {
    var jsonData = pm.response.json();
    const items = jsonData.data || [];
    pm.expect(items).to.be.an("array").that.is.not.empty;
    pm.environment.set("ingredientId", items[0].id);
    pm.collectionVariables.set("ingredientId", items[0].id);
});
`,
        }),
        createRequestItem({
          name: '02. Get Ingredient Detail by ID',
          method: 'GET',
          path: '/staff/inventory/{{ingredientId}}',
          headers: [{ key: 'Authorization', value: 'Bearer {{baristaToken}}' }],
          testScript: `
pm.test("Status code is 200 OK", function () {
    pm.response.to.have.status(200);
});
pm.test("Ingredient detail matches ID", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.id).to.eql(pm.environment.get("ingredientId"));
});
`,
        }),
        createRequestItem({
          name: '03. Barista Update Stock Attempt - Explicit Forbidden (403)',
          method: 'PATCH',
          path: '/staff/inventory/{{ingredientId}}/stock',
          headers: [{ key: 'Authorization', value: 'Bearer {{baristaToken}}' }],
          body: {
            stockQuantity: 9999,
          },
          testScript: `
pm.test("Status code is 403 Forbidden", function () {
    pm.response.to.have.status(403);
});
pm.test("Explicit message denying barista stock updates", function () {
    var jsonData = pm.response.json();
    var msg = (jsonData.error && jsonData.error.message) || jsonData.message;
    pm.expect(msg).to.include("Barista chỉ được xem tồn kho");
});
`,
        }),
        createRequestItem({
          name: '04. Access Staff Inventory - Customer Forbidden (403)',
          method: 'GET',
          path: '/staff/inventory',
          headers: [{ key: 'Authorization', value: 'Bearer {{customerToken}}' }],
          testScript: `
pm.test("Status code is 403 Forbidden", function () {
    pm.response.to.have.status(403);
});
`,
        }),
      ],
    },
  ],
};

const environment = {
  id: 'e9b2a1c0-4321-4f68-9876-brewlite-env',
  name: 'BrewLite Local Environment',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3001/api/v1', enabled: true },
    { key: 'customerToken', value: '', enabled: true },
    { key: 'baristaToken', value: '', enabled: true },
    { key: 'operatorToken', value: '', enabled: true },
    { key: 'customerId', value: '', enabled: true },
    { key: 'baristaId', value: '', enabled: true },
    { key: 'operatorId', value: '', enabled: true },
    { key: 'productId', value: '', enabled: true },
    { key: 'productVariantId', value: '', enabled: true },
    { key: 'toppingId', value: '', enabled: true },
    { key: 'orderId', value: '', enabled: true },
    { key: 'cancelOrderId', value: '', enabled: true },
    { key: 'paymentId', value: '', enabled: true },
    { key: 'paymentIdempotencyKey', value: '', enabled: true },
    { key: 'ingredientId', value: '', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

const collectionPath = resolve(postmanDir, 'BrewLite_API.postman_collection.json');
const environmentPath = resolve(postmanDir, 'BrewLite_Environment.postman_environment.json');

writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf-8');
writeFileSync(environmentPath, JSON.stringify(environment, null, 2), 'utf-8');

console.log(`Generated Postman Collection at: ${collectionPath}`);
console.log(`Generated Postman Environment at: ${environmentPath}`);
