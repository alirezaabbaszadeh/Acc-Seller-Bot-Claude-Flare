export interface Env {
  BOT_TOKEN: string;
  ADMIN_ID: string;
  ADMIN_PHONE: string;
  /**
   * Base64 encoded AES key used for encrypting credentials.
   */
  AES_KEY: string;
  DB: D1Database;
  PROOFS: R2Bucket;
  /**
   * Shared key required to access the `/totp` route.
   * Leave unset to disable this endpoint in production.
   */
  TOTP_KEY?: string;
}

export function validateEnv(env: Env): void {
  const missing: string[] = [];
  if (!env.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!env.ADMIN_ID) missing.push('ADMIN_ID');
  if (!env.ADMIN_PHONE) missing.push('ADMIN_PHONE');
  if (!env.AES_KEY) missing.push('AES_KEY');
  if (!env.DB) missing.push('DB');
  if (!env.PROOFS) missing.push('PROOFS');
  if (missing.length) {
    throw new Error(`Missing environment bindings: ${missing.join(', ')}`);
  }
}
