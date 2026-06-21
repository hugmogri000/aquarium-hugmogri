# Eco Bucket Aquarium Deployment Notes

This folder now contains a static site prepared for `aquarium.hugmogri.com`.

Main entry files:

- `index.html`
- `site.css`
- `payment.js`
- `functions/api/check-payment.js`
- `_headers`
- `eco-bucket-aquarium-catalog-en.pdf`
- `eco-bucket-aquarium-catalog-en-long.png`
- `catalog-panels-v2-en/`
- `assets/`

## Recommended: Cloudflare Pages

This is the simplest option for US and Australia visitors because Cloudflare will serve the site from edge locations close to them.

1. Create a new Cloudflare Pages project.
2. Use Direct Upload, or connect a Git repository if you want future updates from Git.
3. Upload the contents of this folder as the site root.
4. After the site is live on `*.pages.dev`, open the Pages project and add the custom domain `aquarium.hugmogri.com`.
5. Cloudflare usually creates the required DNS record automatically. If it does not, create:
   - Type: `CNAME`
   - Name: `aquarium`
   - Target: `<your-project>.pages.dev`
6. Keep the Cloudflare proxy enabled.

## Crypto Payment Setup

The purchase modal is wired in `payment.js`. Before publishing real payments, update the `PAYMENT_CONFIG` values:

- `amount`
- `receivingAddress`
- `paymentLink` or `qrImageUrl`

For Cloudflare Pages, the payment status endpoint is prepared at:

```text
/api/check-payment
```

Set these Pages environment variables after you provide the TRON payment query API:

- `TRON_PAYMENT_API_URL`
- `TRON_PAYMENT_API_KEY` if the API requires a token

The function currently normalizes API responses that include `paid: true`, `status: "paid"`, or `status: "success"`.

## Alternative: Tencent Light Application Server + Cloudflare

If you want the site hosted on your Tencent server instead of Pages:

1. Upload the contents of this folder to a directory such as `/var/www/aquarium.hugmogri.com`.
2. Copy the included Nginx example config:
   - `aquarium.hugmogri.com.nginx.conf`
3. Adjust the `root` path if needed.
4. Enable the Nginx site and reload Nginx.
5. In Cloudflare DNS, create:
   - Type: `A`
   - Name: `aquarium`
   - IPv4 address: `<your Tencent server public IP>`
6. Keep the Cloudflare proxy enabled so US and AU visitors use Cloudflare caching and TLS.

## SSL

For the Tencent server route, use one of these:

- Cloudflare Origin Certificate + `Full (strict)` SSL mode
- Certbot / Let's Encrypt on the server + `Full (strict)` SSL mode

## Quick Validation

After deployment, confirm:

1. `https://aquarium.hugmogri.com/` opens.
2. `https://aquarium.hugmogri.com/eco-bucket-aquarium-catalog-en.pdf` opens.
3. `https://aquarium.hugmogri.com/eco-bucket-aquarium-catalog-en-long.png` opens.
4. The panel images under `catalog-panels-v2-en/` load normally.

## Local Preview

Run the local preview server from this folder:

```powershell
node preview-server.js
```

Then open:

```text
http://127.0.0.1:4190/
```
