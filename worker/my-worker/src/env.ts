export interface Env {
  BOT_TOKEN: string;
  ADMIN_ID: string;
  ADMIN_PHONE: string;
  FERNET_KEY: string;
  DB: D1Database;
  PROOFS: R2Bucket;
}
