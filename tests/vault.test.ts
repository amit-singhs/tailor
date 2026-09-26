import { describe, expect, it } from 'vitest';
import { open, passphraseProblem, seal } from '../lib/vault/crypto';

describe('vault crypto', () => {
  it('round-trips with the right passphrase', async () => {
    const sealed = await seal('ts_live_abcdef123456', 'correct horse battery', 1000);
    expect(sealed.ciphertext).not.toContain('abcdef');
    expect(sealed.hint).toBe('3456');
    await expect(open(sealed, 'correct horse battery')).resolves.toBe('ts_live_abcdef123456');
  });

  it('rejects a wrong passphrase', async () => {
    const sealed = await seal('secret-key-value', 'passphrase-one', 1000);
    await expect(open(sealed, 'passphrase-two')).rejects.toMatchObject({ code: 'BAD_PASSPHRASE' });
  });

  it('detects tampering', async () => {
    const sealed = await seal('secret-key-value', 'passphrase-one', 1000);
    const bytes = atob(sealed.ciphertext).split('');
    bytes[0] = String.fromCharCode(bytes[0]!.charCodeAt(0) ^ 1);
    await expect(open({ ...sealed, ciphertext: btoa(bytes.join('')) }, 'passphrase-one')).rejects.toMatchObject({ code: 'BAD_PASSPHRASE' });
  });

  it('uses fresh salt and IV each time', async () => {
    const a = await seal('same', 'same-passphrase', 1000);
    const b = await seal('same', 'same-passphrase', 1000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });

  it('checks passphrase strength', () => {
    expect(passphraseProblem('short')).toBeTruthy();
    expect(passphraseProblem('aaaaaaaaaa')).toBeTruthy();
    expect(passphraseProblem('a decent passphrase')).toBeNull();
  });
});
