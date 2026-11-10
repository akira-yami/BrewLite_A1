#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3001/api/v1}"
PASS_COUNT=0
FAIL_COUNT=0

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }

print_summary() {
  printf "\n==========================================================\n"
  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    green "  TONG KET: $PASS_COUNT PASS / $FAIL_COUNT FAIL"
  else
    red "  TONG KET: $PASS_COUNT PASS / $FAIL_COUNT FAIL"
  fi
  printf "==========================================================\n"
}
trap print_summary EXIT

json_get() {
  local json="$1"
  local path="$2"
  printf "%s" "$json" | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      try {
        const obj = JSON.parse(raw);
        const keys = process.argv[1].split(".");
        let cur = obj;
        for (const k of keys) {
          if (cur == null) break;
          cur = cur[k];
        }
        process.stdout.write(cur == null ? "" : String(cur));
      } catch {}
    });
  ' "$path"
}

http_code() {
  local out
  if ! out=$(curl -sS --connect-timeout 5 --max-time 15 -o /dev/null -w "%{http_code}" "$@" 2>/dev/null); then
    printf "000"
    return 0
  fi
  if [[ "$out" =~ ^[0-9]{3}$ ]]; then
    printf "%s" "$out"
  else
    printf "000"
  fi
}

http_request() {
  local out
  if ! out=$(curl -sS --connect-timeout 5 --max-time 15 -w "\n%{http_code}" "$@" 2>/dev/null); then
    printf "\n000"
    return 0
  fi
  local code
  code=$(printf "%s\n" "$out" | tail -n1)
  if [[ "$code" =~ ^[0-9]{3}$ ]]; then
    printf "%s" "$out"
  else
    printf "%s\n000" "$out"
  fi
}

assert_status() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    green "  [PASS] $label (HTTP $actual)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    red "  [FAIL] $label (Expected HTTP $expected, got $actual)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

assert_equals() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    green "  [PASS] $label ($actual)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    red "  [FAIL] $label (Expected '$expected', got '$actual')"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

require_step() {
  local step_name="$1"
  local actual_code="$2"
  local expected_code="$3"
  local var_name="${4:-}"
  local var_value="${5:-}"
  if [[ "$actual_code" != "$expected_code" ]]; then
    red "  [FATAL] $step_name that bai (HTTP $actual_code != $expected_code). Dung E2E."
    exit 1
  fi
  if [[ -n "$var_name" && -z "$var_value" ]]; then
    red "  [FATAL] $step_name khong tra ve '$var_name'. Dung E2E."
    FAIL_COUNT=$((FAIL_COUNT + 1))
    exit 1
  fi
}

printf "\n[1/7] Kiem tra Health...\n"
HEALTH_STATUS=$(http_code "$API_URL/health")
assert_status "GET /health" "$HEALTH_STATUS" "200"
require_step "GET /health" "$HEALTH_STATUS" "200"

printf "\n[2/7] Kiem tra Dang ky & Dang nhap (User A & User B)...\n"
RAND_ID="${RANDOM}$(date +%s)"
USER_A="cust_a_${RAND_ID}"
USER_B="cust_b_${RAND_ID}"
PASS="StrongPass123!"

REG_A_RES=$(http_request -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_A\",\"password\":\"$PASS\"}" \
  "$API_URL/auth/register")
REG_A_CODE=$(printf "%s\n" "$REG_A_RES" | tail -n1)
assert_status "POST /auth/register (User A)" "$REG_A_CODE" "201"
require_step "POST /auth/register (User A)" "$REG_A_CODE" "201"

LOGIN_A_RES=$(http_request -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_A\",\"password\":\"$PASS\"}" \
  "$API_URL/auth/login")
LOGIN_A_BODY=$(printf "%s\n" "$LOGIN_A_RES" | sed '$d')
LOGIN_A_CODE=$(printf "%s\n" "$LOGIN_A_RES" | tail -n1)
assert_status "POST /auth/login (User A)" "$LOGIN_A_CODE" "200"
TOKEN_A=$(json_get "$LOGIN_A_BODY" "data.accessToken")
require_step "POST /auth/login (User A)" "$LOGIN_A_CODE" "200" "TOKEN_A" "$TOKEN_A"

REG_B_RES=$(http_request -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_B\",\"password\":\"$PASS\"}" \
  "$API_URL/auth/register")
REG_B_CODE=$(printf "%s\n" "$REG_B_RES" | tail -n1)
assert_status "POST /auth/register (User B)" "$REG_B_CODE" "201"
require_step "POST /auth/register (User B)" "$REG_B_CODE" "201"

LOGIN_B_RES=$(http_request -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_B\",\"password\":\"$PASS\"}" \
  "$API_URL/auth/login")
LOGIN_B_BODY=$(printf "%s\n" "$LOGIN_B_RES" | sed '$d')
LOGIN_B_CODE=$(printf "%s\n" "$LOGIN_B_RES" | tail -n1)
assert_status "POST /auth/login (User B)" "$LOGIN_B_CODE" "200"
TOKEN_B=$(json_get "$LOGIN_B_BODY" "data.accessToken")
require_step "POST /auth/login (User B)" "$LOGIN_B_CODE" "200" "TOKEN_B" "$TOKEN_B"

printf "\n[3/7] Kiem tra Catalog Menu & Chi tiet san pham...\n"
PRODUCTS_RES=$(http_request "$API_URL/products")
PRODUCTS_BODY=$(printf "%s\n" "$PRODUCTS_RES" | sed '$d')
PRODUCTS_CODE=$(printf "%s\n" "$PRODUCTS_RES" | tail -n1)
assert_status "GET /products" "$PRODUCTS_CODE" "200"
FIRST_PRODUCT_ID=$(json_get "$PRODUCTS_BODY" "data.0.id")
require_step "GET /products" "$PRODUCTS_CODE" "200" "FIRST_PRODUCT_ID" "$FIRST_PRODUCT_ID"

DETAIL_RES=$(http_request "$API_URL/products/$FIRST_PRODUCT_ID")
DETAIL_BODY=$(printf "%s\n" "$DETAIL_RES" | sed '$d')
DETAIL_CODE=$(printf "%s\n" "$DETAIL_RES" | tail -n1)
assert_status "GET /products/:id" "$DETAIL_CODE" "200"
VARIANT_ID=$(json_get "$DETAIL_BODY" "data.variants.0.id")
require_step "GET /products/:id" "$DETAIL_CODE" "200" "VARIANT_ID" "$VARIANT_ID"

printf "\n[4/7] Kiem tra Tao don hang (POST /orders)...\n"
ORDER_RES=$(http_request -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"productVariantId\":\"$VARIANT_ID\",\"quantity\":1,\"sugarLevel\":70,\"iceLevel\":50,\"note\":\"E2E bash test\"}]}" \
  "$API_URL/orders")
ORDER_BODY=$(printf "%s\n" "$ORDER_RES" | sed '$d')
ORDER_CODE=$(printf "%s\n" "$ORDER_RES" | tail -n1)
assert_status "POST /orders (Tao don PENDING)" "$ORDER_CODE" "201"
ORDER_ID=$(json_get "$ORDER_BODY" "data.id")
require_step "POST /orders" "$ORDER_CODE" "201" "ORDER_ID" "$ORDER_ID"

printf "\n[5/7] Kiem tra Session, 401, 403...\n"
ME_CODE=$(http_code -H "Authorization: Bearer $TOKEN_A" "$API_URL/auth/me")
assert_status "GET /auth/me voi Token hop le" "$ME_CODE" "200"

NO_TOKEN_CODE=$(http_code "$API_URL/auth/me")
assert_status "GET /auth/me khong co Token bi chan 401" "$NO_TOKEN_CODE" "401"

STAFF_RBAC_CODE=$(http_code -H "Authorization: Bearer $TOKEN_A" "$API_URL/staff/orders")
assert_status "CUSTOMER truy cap GET /staff/orders bi chan 403 (RolesGuard)" "$STAFF_RBAC_CODE" "403"

printf "\n[6/7] Kiem tra Thanh toan & Chong Double-Charge (Idempotency-Key)...\n"
UNSUPPORTED_RES=$(http_request -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-unsupported-${RAND_ID}" \
  -d "{\"orderId\":\"$ORDER_ID\",\"method\":\"E_WALLET\"}" \
  "$API_URL/payments")
UNSUPPORTED_BODY=$(printf "%s\n" "$UNSUPPORTED_RES" | sed '$d')
UNSUPPORTED_CODE=$(printf "%s\n" "$UNSUPPORTED_RES" | tail -n1)
UNSUPPORTED_ERR=$(json_get "$UNSUPPORTED_BODY" "code")
if [[ -z "$UNSUPPORTED_ERR" ]]; then
  UNSUPPORTED_ERR=$(json_get "$UNSUPPORTED_BODY" "error.code")
fi
assert_status "POST /payments voi E_WALLET bi chan 400" "$UNSUPPORTED_CODE" "400"
assert_equals "Ma loi chan phuong thuc khong ho tro" "$UNSUPPORTED_ERR" "PAYMENT_METHOD_UNSUPPORTED"

IDEM_KEY="idem-${RAND_ID}"
PAY_RES_1=$(http_request -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d "{\"orderId\":\"$ORDER_ID\",\"method\":\"VNPAY\"}" \
  "$API_URL/payments")
PAY_BODY_1=$(printf "%s\n" "$PAY_RES_1" | sed '$d')
PAY_CODE_1=$(printf "%s\n" "$PAY_RES_1" | tail -n1)

if [[ "$PAY_CODE_1" != "200" ]]; then
  PAY_ERR_CODE=$(json_get "$PAY_BODY_1" "code")
  if [[ -z "$PAY_ERR_CODE" ]]; then
    PAY_ERR_CODE=$(json_get "$PAY_BODY_1" "error.code")
  fi
  red "  [FAIL] POST /payments voi VNPAY (Lan 1) that bai (HTTP $PAY_CODE_1, code=${PAY_ERR_CODE:-UNKNOWN}). Bo qua buoc Replay."
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  assert_status "POST /payments voi VNPAY (Lan 1)" "$PAY_CODE_1" "200"
  FIRST_RETRIED=$(json_get "$PAY_BODY_1" "data.isRetried")
  FIRST_PAY_URL=$(json_get "$PAY_BODY_1" "data.paymentUrl")
  assert_equals "Lan 1 khoi tao payment co isRetried=false" "$FIRST_RETRIED" "false"

  PAY_RES_2=$(http_request -X POST \
    -H "Authorization: Bearer $TOKEN_A" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEM_KEY" \
    -d "{\"orderId\":\"$ORDER_ID\",\"method\":\"VNPAY\"}" \
    "$API_URL/payments")
  PAY_BODY_2=$(echo "$PAY_RES_2" | sed '$d')
  PAY_CODE_2=$(echo "$PAY_RES_2" | tail -n1)
  SECOND_RETRIED=$(json_get "$PAY_BODY_2" "data.isRetried")
  SECOND_PAY_URL=$(json_get "$PAY_BODY_2" "data.paymentUrl")

  assert_status "POST /payments (Replay cung Idempotency-Key)" "$PAY_CODE_2" "200"
  assert_equals "Replay tra ve isRetried=true" "$SECOND_RETRIED" "true"
  assert_equals "Replay giu nguyen paymentUrl da luu" "$SECOND_PAY_URL" "$FIRST_PAY_URL"
fi

printf "\n[7/7] Kiem tra Lich su don, Chi tiet don & Co lap don hang giua 2 User...\n"
MY_ORDERS_CODE=$(http_code -H "Authorization: Bearer $TOKEN_A" "$API_URL/orders/me")
assert_status "GET /orders/me (User A)" "$MY_ORDERS_CODE" "200"

ORDER_DETAIL_CODE=$(http_code -H "Authorization: Bearer $TOKEN_A" "$API_URL/orders/$ORDER_ID")
assert_status "GET /orders/:id (User A xem don cua minh)" "$ORDER_DETAIL_CODE" "200"

CROSS_ORDER_CODE=$(http_code -H "Authorization: Bearer $TOKEN_B" "$API_URL/orders/$ORDER_ID")
assert_status "User B truy cap don cua User A bi an bang 404 ORDER_NOT_FOUND (chong UUID enumeration)" "$CROSS_ORDER_CODE" "404"

[[ "$FAIL_COUNT" -eq 0 ]]
