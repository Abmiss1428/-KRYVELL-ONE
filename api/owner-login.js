import crypto from 'node:crypto';

const SESSION_SECONDS = 60 * 60 * 8;

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a || '')).digest();
  const right = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function signature(ownerKey, expires) {
  return crypto.createHmac('sha256', ownerKey).update(`owner:${expires}`).digest('base64url');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const ownerKey = process.env.KRYVELL_OWNER_KEY;
  if (!ownerKey) return res.status(503).json({ ok: false, error: 'owner_auth_not_configured' });

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'kryvell_owner_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return res.status(200).json({ ok: true, owner_session: false });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const supplied = typeof req.body?.key === 'string' ? req.body.key : '';
  if (!safeEqual(supplied, ownerKey)) return res.status(401).json({ ok: false, error: 'owner_auth_failed' });

  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const token = `${expires}.${signature(ownerKey, expires)}`;
  res.setHeader('Set-Cookie', `kryvell_owner_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`);
  return res.status(200).json({ ok: true, owner_session: true, expires_at: expires });
}
