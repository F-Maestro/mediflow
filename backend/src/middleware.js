import { randomUUID } from 'node:crypto';
import { query } from './db.js';
import { tokenHash } from './utils.js';

export async function authenticate(req, res, next) {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9_-]{40,})$/.exec(header);
  if (!match) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
  try {
    const { rows } = await query(`SELECT u.id,u.role,u.phone_lookup_hash,u.active,s.id AS session_id
      FROM sessions s JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [tokenHash(match[1])]);
    if (!rows[0]?.active) return res.status(401).json({ error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Sign in again.' } });
    req.user = { id: rows[0].id, role: rows[0].role, phoneHash: rows[0].phone_lookup_hash, sessionId: rows[0].session_id };
    return next();
  } catch (error) { return next(error); }
}
export const requireRoles = (...roles) => (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not allowed to perform this action.' } });
export async function audit(req, action, resourceType, resourceId = null) {
  await query('INSERT INTO audit_events(id,actor_id,action,resource_type,resource_id,request_id) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), req.user?.id ?? null, action, resourceType, resourceId, req.id ?? null]);
}
