import {
  API_TOKEN_PREFIX_LENGTH,
  API_TOKEN_SCHEME,
} from '@b2b-catalog-platform/shared';
import { bearerToken, generateToken, hashToken } from './api-token-value';

describe('generateToken', () => {
  it('puts the clear prefix at the head of the value', () => {
    const { value, prefix } = generateToken();

    expect(prefix).toHaveLength(API_TOKEN_PREFIX_LENGTH);
    expect(value.startsWith(`${prefix}.`)).toBe(true);
  });

  it('hashes the whole value, prefix included', () => {
    const { value, hash } = generateToken();

    expect(hash).toBe(hashToken(value));
    expect(hash).toHaveLength(64);
  });

  it('does not repeat itself', () => {
    const values = new Set(
      Array.from({ length: 50 }, () => generateToken().value),
    );

    expect(values.size).toBe(50);
  });

  it('stays safe in a header and a URL', () => {
    const { value } = generateToken();

    expect(value).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});

describe('bearerToken', () => {
  it('reads the value after the scheme', () => {
    expect(bearerToken(`${API_TOKEN_SCHEME} abc.def`)).toBe('abc.def');
  });

  it('accepts the scheme in any casing', () => {
    expect(bearerToken('bearer abc.def')).toBe('abc.def');
    expect(bearerToken('BEARER abc.def')).toBe('abc.def');
  });

  it('refuses another scheme, so a basic credential is not read as a token', () => {
    expect(bearerToken('Basic abc.def')).toBeNull();
  });

  it('refuses a header with no value, an absent one, and a list', () => {
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer   ')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken(['Bearer abc.def'])).toBeNull();
  });
});
