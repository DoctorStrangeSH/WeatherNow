# WeatherNow API Worker

Cloudflare Worker for the public WeatherNow frontend. The OpenWeatherMap API key is stored as a Cloudflare secret and is never sent to the browser.

## Prerequisites

- A Cloudflare account with Workers enabled.
- Node.js 20+ and npm.
- An active OpenWeatherMap API key.

## One-time setup

From this directory:

```bash
npx wrangler@latest login
npx wrangler@latest secret put OPENWEATHER_API_KEY
```

Paste the new OpenWeatherMap key only into the Wrangler secret prompt. Do not put it in source files, command arguments, shell history, GitHub Actions logs, or commits.

## Deploy

```bash
npx wrangler@latest deploy
```

The Worker name is intentionally kept as `openweathermap-6310` so the existing `PROXY_URL` remains stable when deployed to the same Cloudflare account and workers.dev subdomain. Verify the deployment URL in the Wrangler output. If Cloudflare assigns a different hostname, update `PROXY_URL` in `js/config.js` to that public Worker URL (it is not a secret).

## Allowed origins

The default list in `wrangler.toml` includes the production GitHub Pages origin and common local development origins. Edit `ALLOWED_ORIGINS` before deployment if the app is hosted elsewhere. Use exact origins only: scheme + hostname + optional port, without a path.

## Supported endpoints

- `GET /weather?q=Berlin`
- `GET /weather?lat=52.52&lon=13.405`
- `GET /forecast?q=Berlin`
- `GET /direct?q=Berlin&limit=5`

Only the required parameters are accepted. The Worker injects `appid`, `units=metric`, and `lang=ru` server-side. Other routes, methods, and unexpected parameters are rejected.

## Rate limiting

The Worker config declares a Cloudflare Rate Limiting binding named `WEATHER_RATE_LIMITER`: 60 valid API requests per client IP per 60 seconds. The binding is checked before cache reads and upstream requests. If the binding rejects a request, the Worker returns HTTP 429 with `Retry-After: 60`; if the binding is unavailable, requests fail closed with HTTP 503.

After deploying this configuration, verify the binding is active in Cloudflare and test the 429 response. The binding namespace is configured in `wrangler.toml`; do not remove it or deploy an older Worker configuration.

## Cache policy

- Current weather: 60 seconds.
- Forecast: 5 minutes.
- Geocoding: 24 hours.

The edge cache is an optimization; requests still work if the Cache API is unavailable.

## Security checklist

1. The previously exposed key has been revoked by the project owner.
2. A replacement key has been stored as the Cloudflare Worker Secret `OPENWEATHER_API_KEY`.
3. Keep the secret out of source files, browser code, command arguments, issues, pull requests and logs.
4. After changing the secret or Worker code, deploy the Worker and verify all production endpoints.
5. Confirm browser requests contain no `appid` parameter.
6. Check that an unapproved Origin receives HTTP 403.

## Local tests

From the repository root:

```bash
node --test tests/*.test.js worker/test/*.test.mjs
```

The tests mock the upstream API and do not need a real key or Cloudflare account.
