import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';
import { authenticator } from 'otplib';

const SECRET = 'JBSWY3DPEHPK3PXP';
env.TOTP_KEY = 'TESTKEY';

describe('/totp route', () => {
  it('returns an authenticator code', async () => {
    const req = new Request(`http://example.com/totp?secret=${SECRET}&key=${env.TOTP_KEY}`);
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toMatch(/^\d{6}$/);
    expect(text).toBe(authenticator.generate(SECRET));
  });
});
