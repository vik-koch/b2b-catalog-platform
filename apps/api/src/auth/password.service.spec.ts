import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes to a self-contained argon2id string, never the plaintext', async () => {
    const digest = await service.hash('correct horse battery staple');

    expect(digest).toContain('$argon2id$');
    expect(digest).not.toContain('correct horse');
  });

  it('produces a different hash each time (random salt)', async () => {
    const [a, b] = await Promise.all([
      service.hash('same-password'),
      service.hash('same-password'),
    ]);

    expect(a).not.toBe(b);
  });

  it('verifies a correct password', async () => {
    const digest = await service.hash('s3cret-pw');

    await expect(service.verify(digest, 's3cret-pw')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const digest = await service.hash('s3cret-pw');

    await expect(service.verify(digest, 'wrong-pw')).resolves.toBe(false);
  });
});
