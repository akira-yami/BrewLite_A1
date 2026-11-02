# VNPay Sandbox + shared HTTPS tunnel setup

Keep `PAYMENT_GATEWAY=mock` for CI and deterministic local tests. Do not enable `vnpay` until merchant credentials and public HTTPS hostnames are provisioned.

## VNPay Sandbox environment

Set these variables in the API runtime only; never commit their values:

- `PAYMENT_GATEWAY=vnpay`
- `VNP_TMN_CODE`: merchant TmnCode issued by VNPay.
- `VNP_HASH_SECRET`: merchant signing secret issued by VNPay.
- `VNP_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`
- `VNP_RETURN_URL=https://<api-host>/api/v1/payments/vnpay/return`
- `VNP_IPN_URL=https://<api-host>/api/v1/payments/vnpay/ipn`
- `WEB_PUBLIC_URL=https://<web-host>`

Register the exact IPN URL in the VNPay merchant portal. IPN is public and must be HTTPS. It validates HMAC-SHA512, merchant code and amount, then updates Payment and Order within a transaction. Return verifies the signature and redirects to the frontend; it does not settle payment state.

## Cloudflare Named Tunnel

A team-managed domain is required. Create a Named Tunnel in the team's Cloudflare account. Add a Published Application route for the API hostname to `http://backend:3001` (cloudflared runs in the Compose network), and configure DNS for that hostname to the tunnel's `<UUID>.cfargotunnel.com` target in the same Cloudflare account.

Store the tunnel token locally as `CLOUDFLARE_TUNNEL_TOKEN`; do not commit it. Start the optional service:

```bash
docker compose --profile tunnel up -d --build
```

The hostname and DNS route are configured in Cloudflare; this repository intentionally contains no token or fabricated domain.

## Required callback mapping

- Return: `https://<api-host>/api/v1/payments/vnpay/return`
- IPN: `https://<api-host>/api/v1/payments/vnpay/ipn`
- Frontend: `WEB_PUBLIC_URL=https://<web-host>`

Keep Docker backend and tunnel services online while VNPay can retry IPN.

## Activation checklist

1. Apply the migration and regenerate Prisma Client.
2. Set merchant and tunnel secrets in an untracked `.env`/secret manager.
3. Configure API and web public hostnames in Cloudflare.
4. Register the exact IPN URL in VNPay merchant settings.
5. Set `PAYMENT_GATEWAY=vnpay` only in Sandbox.
6. Verify success, decline/cancel, invalid signature, wrong amount, duplicate IPN, Return-before-IPN and reload/replay.

See [VNPay PAY integration](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html) and [Cloudflare Published Applications](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/).
