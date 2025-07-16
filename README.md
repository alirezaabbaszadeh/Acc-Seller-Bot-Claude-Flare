# Account Seller Bot

این مخزن شامل رباتی برای فروش حساب‌ها در تلگرام است. در این فایل راهنمای سریع نصب و راه‌اندازی برای کاربران تازه‌کار آورده شده است.

## پیش‌نیازها
- یک حساب Cloudflare فعال
- نصب Node.js نسخه 20 یا بالاتر
- نصب ابزار [Wrangler](https://developers.cloudflare.com/workers/wrangler/) برای مدیریت Cloudflare Workers

## مراحل نصب سریع

1. **دریافت کد**
   مخزن را کلون کرده و وارد پوشه `worker/my-worker` شوید.
2. **ویرایش تنظیمات**
   در فایل `wrangler.toml` مقادیر `account_id`، `database_id` و نام سطل‌ها را با اطلاعات حساب Cloudflare خود جایگزین کنید.
3. **ایجاد منابع Cloudflare**
   ```bash
   wrangler r2 bucket create payment-proofs
   wrangler d1 create account-bot
   wrangler d1 migrations apply account-bot
   ```
4. **قرار دادن متغیرهای محرمانه**
   ```bash
   wrangler secret put BOT_TOKEN
   wrangler secret put ADMIN_ID
   wrangler secret put ADMIN_PHONE
   wrangler secret put AES_KEY
   ```
5. **انتشار Worker**
   پس از انجام مراحل بالا دستور زیر را اجرا کنید:
   ```bash
   wrangler deploy
   ```
6. **تنظیم وب‌هوک تلگرام**
   دامنه Worker خود را در فرمان زیر جایگزین کنید:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<YOUR_WORKER_DOMAIN>/telegram"
   ```

اکنون ربات آماده استفاده است و پیام‌های تلگرام را دریافت می‌کند.

## اطلاعات بیشتر
برای آشنایی با دستورات پیشرفته، فایل [docs/README.md](docs/README.md) را مطالعه کنید.
در صورتی که هیچ آشنایی قبلی با Cloudflare ندارید و به دنبال راهنمای گام‌به‌گام هستید، به سند [docs/full-guide-fa.md](docs/full-guide-fa.md) مراجعه کنید.
