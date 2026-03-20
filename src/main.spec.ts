import { describe, expect, it, vi, type Mock } from 'vitest';
import { createCorsOriginDelegate } from './main';

type DelegateResult = { error: Error | null; allow?: boolean; warn: Mock };

describe('createCorsOriginDelegate', () => {
  const invoke = (
    allowedOrigins: string[],
    origin?: string,
  ): DelegateResult => {
    const warn = vi.fn();
    const delegate = createCorsOriginDelegate(allowedOrigins, { warn });
    let error: Error | null = null;
    let allow: boolean | undefined;

    delegate(origin, (callbackError: Error | null, callbackAllow?: boolean) => {
      error = callbackError;
      allow = callbackAllow;
    });

    return { error, allow, warn };
  };

  it('allows non-browser requests without Origin', () => {
    const result = invoke([], undefined);

    expect(result.error).toBeNull();
    expect(result.allow).toBe(true);
    expect(result.warn).not.toHaveBeenCalled();
  });

  it('allows configured browser origins', () => {
    const result = invoke(
      ['https://allowed.example'],
      'https://allowed.example',
    );

    expect(result.error).toBeNull();
    expect(result.allow).toBe(true);
    expect(result.warn).not.toHaveBeenCalled();
  });

  it('rejects browser origins outside the allowlist and logs a warning', () => {
    const result = invoke([], 'https://evil.example');

    expect(result.error).toEqual(
      new Error('Origin https://evil.example is not allowed by CORS'),
    );
    expect(result.allow).toBe(false);
    expect(result.warn).toHaveBeenCalledWith(
      'Rejected CORS request from origin: https://evil.example',
    );
  });
});
