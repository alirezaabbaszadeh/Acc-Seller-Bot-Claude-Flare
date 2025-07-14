export interface Data {
  products: Record<string, Record<string, any>>;
  pending: any[];
  pending_add: any[];
  pending_edit: any[];
  languages: Record<string, string>;
}

export function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export async function encryptField(value: string, keyB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    b64ToBytes(keyB64),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return bytesToB64(out);
}

export async function decryptField(value: string, keyB64: string): Promise<string> {
  const data = b64ToBytes(value);
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const key = await crypto.subtle.importKey(
    'raw',
    b64ToBytes(keyB64),
    'AES-GCM',
    false,
    ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export async function encryptData(data: Data, key: string): Promise<Data> {
  const result: Data = structuredClone(data);
  for (const product of Object.values(result.products || {})) {
    for (const field of ['username', 'password', 'secret'] as const) {
      const value = product[field];
      if (typeof value === 'string') {
        product[field] = await encryptField(value, key);
      }
    }
  }
  return result;
}

export async function decryptData(data: Data, key: string): Promise<Data> {
  const result: Data = structuredClone(data);
  for (const product of Object.values(result.products || {})) {
    for (const field of ['username', 'password', 'secret'] as const) {
      const value = product[field];
      if (typeof value === 'string') {
        try {
          product[field] = await decryptField(value, key);
        } catch {
          product[field] = '';
        }
      }
    }
  }
  return result;
}
