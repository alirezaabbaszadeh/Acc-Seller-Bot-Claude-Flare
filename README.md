# Account-Seller-Bot

A Telegram bot for selling products with manual payment approval and two-factor authentication codes.

## Table of Contents
- [Features](#features)
- [Language Support](#language-support)
- [Menu Navigation](#menu-navigation)
- [Worker Deployment](#worker-deployment)
- [Wrangler Commands](#wrangler-commands)
- [Development](#development)

## Features
- Admin can add products with price, credentials, TOTP secret, and optional name.
- Products may be added interactively from the admin menu or by running `/addproduct` with no arguments.
- Users can browse products and submit payment proof.
- Admin approves purchases and credentials are sent to the buyer.
- Buyers can obtain a current authenticator code with `/code <product_id>`.
- Admin can list and manage buyers.
- Admin can edit product fields (including the name) via inline buttons in the admin menu or the `/editproduct` command. Credentials can also be resent using the "Resend" button or `/resend`.
- Admin can remove a product with `/deleteproduct <id>` or by pressing the inline "Delete" button and confirming.
- Admin can list pending purchases with `/pending` and reject them with `/reject`.
- Stats for each product are available with `/stats`.
- Users can view the admin phone number with `/contact`.
- Users can get a list of all commands with `/help`.
- Users may switch language from the main menu through the "Language" button or via `/setlang`. Bot messages support both English and Farsi.
- پشتیبانی از منوهای سلسله‌مراتبی با دکمه‌های تلگرامی.
- دکمه «بازگشت» و دکمه‌های جدید مدیریتی به منو افزوده شده‌اند.


## Language Support
Users can switch their preferred language with:

```bash
/setlang <code>
```

Replace `<code>` with a language code such as `en` or `fa`. You can also change
the language from the main menu by pressing the "Language" button.

The `/addproduct` command accepts an optional `[name]` argument to label the
product:

```bash
/addproduct <id> <price> <username> <password> <secret> [name]
```

Example adding a product with a name:

```bash
/addproduct 1001 9.99 someuser somepass JBSWY3DPEHPK3PXP "My Product"
```

Alternatively, run `/addproduct` with no arguments or choose "Add product" from
the admin menu to add items interactively.

## Menu Navigation
در این بخش نحوه استفاده از منوهای ربات توضیح داده شده است.

پس از اجرای ربات با دستور `/start`، منوی اصلی نمایش داده می‌شود که شامل دکمه‌های
«محصولات»، «تماس»، «راهنما» و «زبان» است. اگر کاربر مدیر باشد، گزینه «مدیریت»
نیز دیده می‌شود. برای ورود به هر بخش روی دکمه مربوطه بزنید و در هر مرحله با دکمه
«بازگشت» می‌توانید به مرحله قبل بروید.

**مثال کاربر**
1. ارسال `/start`
2. انتخاب «محصولات» برای مشاهده لیست حساب‌ها
3. انتخاب «زبان» و تعیین زبان دلخواه
4. فشردن «بازگشت» جهت بازگشت به منوی اصلی

**مثال مدیر**
1. ارسال `/start`
2. انتخاب «مدیریت»
3. انتخاب «مدیریت محصولات»
4. انتخاب محصول و استفاده از دکمه‌های «حذف» یا «ارسال دوباره»
5. انتخاب «در انتظار» برای مشاهده خریدهای معلق
6. فشردن «بازگشت» جهت بازگشت به منوی قبل

**مثال ویرایش محصول**
1. ورود به بخش «مدیریت»
2. انتخاب «ویرایش محصول»
3. انتخاب شناسهٔ محصول
4. انتخاب فیلد موردنظر (مثلاً «قیمت») و ارسال مقدار جدید

This is a minimal implementation and does not include persistent database
storage or full error handling.

## Worker Deployment

This project includes a Cloudflare Worker located in `worker/my-worker` that can
serve the bot without running a dedicated server.

**Prerequisite:** ensure you have Node.js version 20 or newer installed. Older
versions may fail to start the Worker.

To deploy the Worker:

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and
   ensure you are logged in (`wrangler login`).
2. Edit `worker/my-worker/wrangler.toml` and replace the example `account_id`,
   `route`, and resource IDs with values from your Cloudflare account.
3. Create the R2 bucket defined in the `wrangler.toml` file:
   ```bash
   wrangler r2 bucket create payment-proofs
   ```
4. Create the D1 database and apply migrations:
   ```bash
   wrangler d1 create account-bot
   wrangler d1 migrations apply account-bot
   ```
5. Generate a base64-encoded AES key for encrypting credentials. You can
   create one with:

   ```bash
   openssl rand -base64 32
   ```
   Copy the output and save it for the next step.

6. From the `worker/my-worker` directory, set the required secrets:
  ```bash
  wrangler secret put BOT_TOKEN
  wrangler secret put ADMIN_ID
  wrangler secret put ADMIN_PHONE
  wrangler secret put AES_KEY
  ```
7. Deploy the Worker by running `wrangler deploy` (or `npm run deploy`).
8. After deployment, set the Telegram webhook to point to the Worker route:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<YOUR_WORKER_DOMAIN>/telegram"
   ```

Once the webhook is configured, Telegram will deliver updates to the `/telegram`
endpoint of your Worker.

## Wrangler Commands

Common Wrangler CLI commands for working on the Worker and databases:

### Development server

Run a local development server with automatic reloads:

```bash
wrangler dev
```

### Remote preview

Test against Cloudflare's edge in a preview environment:

```bash
wrangler dev --remote
```

### Database queries

Execute SQL or apply migrations to the D1 database:

```bash
wrangler d1 execute account-bot --command "SELECT * FROM purchases;"
wrangler d1 migrations apply account-bot
```

### Secrets and bindings

Store secrets used by your Worker:

```bash
wrangler secret put BOT_TOKEN
wrangler secret put ADMIN_ID
```

Define D1 and R2 bindings in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "account-bot"
database_id = "<your-database-id>"

[[r2_buckets]]
binding = "PROOFS"
bucket_name = "payment-proofs"
preview_bucket_name = "payment-proofs-dev"
```


## Development
Use Node.js 20 or newer so `wrangler` can run correctly. The test suite requires a local D1 database. Apply migrations before running the tests:

```bash
wrangler d1 migrations apply
npx vitest run
```

The migration files reside in `worker/my-worker/migrations/`.
