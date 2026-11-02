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

A team-managed domain on the same Cloudflare account is required. Create a remotely-managed Named Tunnel in **Networking > Tunnels > Create Tunnel**. Once created, use the dashboard to add two Published Application routes:
- API hostname `api.<team-domain>` → `http://backend:3001`
- Web hostname `app.<team-domain>` → `http://frontend:3000`

The tunnel and DNS record must belong to the same Cloudflare account. Cloudflare creates a CNAME target `<UUID>.cfargotunnel.com` for each published hostname.

In the tunnel dashboard select **Add a replica**, copy the cloudflared install command and extract its tunnel token. Store it in the root `.env` as `CLOUDFLARE_TUNNEL_TOKEN`; never commit it. Copy root `.env.example` to `.env`, then fill both public hostnames and merchant settings. Start the optional service:

```bash
docker compose --profile tunnel up -d --build
```

The hostname and DNS route are configured in Cloudflare; this repository intentionally contains no token or fabricated domain. Cloudflare requires a Cloudflare account, a domain on Cloudflare, and an origin machine/VM with outbound connectivity to Cloudflare (verify port 7844 if the network has egress restrictions). The tunnel token is sufficient to run a remotely-managed tunnel; treat anyone holding the token as able to run that tunnel.

## Required callback mapping

- Return: `https://api.<team-domain>/api/v1/payments/vnpay/return`
- IPN: `https://api.<team-domain>/api/v1/payments/vnpay/ipn`
- Frontend: `WEB_PUBLIC_URL=https://app.<team-domain>`

Register the exact IPN URL in the VNPay merchant dashboard after DNS/tunnel health is confirmed. Ensure the domain is hosted in the same Cloudflare account as the tunnel. The origin routes above are private Docker service DNS names and are not public callback URLs.

Keep Docker backend and tunnel services online while VNPay can retry IPN.

## Activation checklist

1. Apply the migration and regenerate Prisma Client.
2. Set merchant and tunnel secrets in an untracked `.env`/secret manager.
3. Configure API and web public hostnames in Cloudflare.
4. Register the exact IPN URL in VNPay merchant settings.
5. Set `PAYMENT_GATEWAY=vnpay` only in Sandbox.
6. Verify success, decline/cancel, invalid signature, wrong amount, duplicate IPN, Return-before-IPN and reload/replay.

See [VNPay PAY integration](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html) and [Cloudflare Published Applications](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/).
