# Account Seller Bot

این مخزن شامل رباتی است که با استفاده از **Cloudflare Workers** در بستر تلگرام فعالیت می‌کند. این راهنما برای افرادی نوشته شده که تجربهٔ زیادی در کار با Cloudflare یا Node.js ندارند و می‌خواهند قدم به قدم ربات را راه‌اندازی کنند.

## پیش‌نیازها

1. **حساب Cloudflare** – اگر حساب ندارید به آدرس [cloudflare.com](https://dash.cloudflare.com/sign-up) بروید و یک حساب رایگان ایجاد کنید.
2. **نصب Node.js نسخهٔ 20 یا بالاتر** – ساده‌ترین روش استفاده از [nvm](https://github.com/nvm-sh/nvm) است:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
   source ~/.nvm/nvm.sh
   nvm install 20
   ```
3. **نصب Wrangler** – ابزار خط فرمان Cloudflare:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
4. **توکن ربات تلگرام** – از [@BotFather](https://t.me/BotFather) یک ربات بسازید و توکن آن را نگه دارید.

## نصب و راه‌اندازی گام‌به‌گام

1. **دریافت کد منبع**
   ```bash
   git clone https://github.com/<your-name>/Acc-Seller-Bot-Claude-Flare.git
   cd Acc-Seller-Bot-Claude-Flare/worker/my-worker
   npm install
   ```
2. **ویرایش فایل `wrangler.toml`**
   - مقدار `account_id` را از داشبورد Cloudflare بردارید و جایگزین کنید.
   - نام سطل‌های R2 و شناسهٔ پایگاه داده D1 را به دلخواه تنظیم کنید.
   - در صورت نیاز مقدار `route` را برای دامنهٔ دلخواه خود تغییر دهید.
3. **ایجاد منابع Cloudflare (R2 و D1)**
   ```bash
   wrangler r2 bucket create payment-proofs
   wrangler d1 create account-bot
   wrangler d1 migrations apply account-bot
   ```
4. **تولید کلید AES برای رمزگذاری**
   ```bash
   openssl rand -base64 32
   ```
   خروجی را کپی و در مرحلهٔ بعد استفاده کنید.
5. **قرار دادن متغیرهای محرمانه**
   ```bash
   wrangler secret put BOT_TOKEN       # توکن دریافتی از BotFather
   wrangler secret put ADMIN_ID        # شناسهٔ عددی تلگرام مدیر
   wrangler secret put ADMIN_PHONE     # شمارهٔ تماسی که به خریداران نمایش داده می‌شود
   wrangler secret put AES_KEY         # کلید تولید شده در مرحلهٔ قبل
   ```
6. **انتشار Worker روی Cloudflare**
   ```bash
   wrangler deploy
   ```
7. **تنظیم وب‌هوک تلگرام**
   آدرس Worker منتشر شده را در دستور زیر قرار دهید:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<YOUR_WORKER_DOMAIN>/telegram"
   ```

پس از ثبت وب‌هوک، ربات آمادهٔ استفاده خواهد بود و پیام‌های کاربران را دریافت می‌کند.

برای آشنایی با قابلیت‌های پیشرفته و دستورات توسعه، به فایل [docs/README.md](docs/README.md) مراجعه کنید.
