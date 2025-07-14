export interface Env {
  BOT_TOKEN: string;
  ADMIN_ID: string;
  ADMIN_PHONE: string;
  /**
   * Base64 encoded AES key used for encrypting credentials.
   * `FERNET_KEY` is still supported for backward compatibility.
   */
  AES_KEY: string;
  FERNET_KEY?: string;
  DB: D1Database;
  PROOFS: R2Bucket;
}
