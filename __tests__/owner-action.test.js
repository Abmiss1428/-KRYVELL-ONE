import { hasOwnerSession, signature } from '../api/owner-action.js';

describe('hasOwnerSession', () => {
  const ownerKey = 'test-owner-key';

  const createReq = (cookieStr) => ({
    headers: {
      cookie: cookieStr
    }
  });

  const createValidToken = (expires) => {
    const sig = signature(ownerKey, expires);
    return `${expires}.${sig}`;
  };

  it('returns true for a valid session token', () => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = createValidToken(expires);
    const req = createReq(`kryvell_owner_session=${token}`);

    expect(hasOwnerSession(req, ownerKey)).toBe(true);
  });

  it('returns false if ownerKey is not provided', () => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = createValidToken(expires);
    const req = createReq(`kryvell_owner_session=${token}`);

    expect(hasOwnerSession(req, null)).toBe(false);
    expect(hasOwnerSession(req, undefined)).toBe(false);
    expect(hasOwnerSession(req, '')).toBe(false);
  });

  it('returns false if there is no cookie header', () => {
    const req = createReq(undefined);
    expect(hasOwnerSession(req, ownerKey)).toBe(false);
  });

  it('returns false if kryvell_owner_session cookie is missing', () => {
    const req = createReq('other_cookie=value; another_cookie=123');
    expect(hasOwnerSession(req, ownerKey)).toBe(false);
  });

  it('returns false if token is improperly formatted', () => {
    const req = createReq('kryvell_owner_session=invalidformat');
    expect(hasOwnerSession(req, ownerKey)).toBe(false);
  });

  it('returns false if the token has expired', () => {
    const expires = Math.floor(Date.now() / 1000) - 3600;
    const token = createValidToken(expires);
    const req = createReq(`kryvell_owner_session=${token}`);

    expect(hasOwnerSession(req, ownerKey)).toBe(false);
  });

  it('returns false if expires is not a valid number', () => {
    const token = `notanumber.somesignature`;
    const req = createReq(`kryvell_owner_session=${token}`);

    expect(hasOwnerSession(req, ownerKey)).toBe(false);
  });

  it('returns false if signature is incorrect', () => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const wrongSig = signature('wrong-key', expires);
    const token = `${expires}.${wrongSig}`;
    const req = createReq(`kryvell_owner_session=${token}`);

    expect(hasOwnerSession(req, ownerKey)).toBe(false);
  });

  it('returns false if signature length does not match', () => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const sig = signature(ownerKey, expires);
    const token = `${expires}.${sig}extra`;
    const req = createReq(`kryvell_owner_session=${token}`);

    expect(hasOwnerSession(req, ownerKey)).toBe(false);
  });
});
