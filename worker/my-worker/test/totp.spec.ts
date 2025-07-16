import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';

const SECRET = 'JBSWY3DPEHPK3PXP';

describe('/totp route', () => {
  it('returns an authenticator code', async () => {
    const req = new Request(`http://example.com/totp?secret=${SECRET}`);
    const res = await SELF.fetch(req);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toMatch(/^\d{6}$/);
    expect(text).toBe(authenticator.generate(SECRET));
  });
});
