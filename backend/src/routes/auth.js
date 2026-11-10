import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { authenticate, audit } from '../middleware.js';
import { createOtp, decryptJson, encryptJson, hashPassword, lookupHash, normalizePhone, otpHash, secureEqualHex, tokenHash, uuid, verifyPassword } from '../utils.js';
import { sendOtp } from '../providers/sms.js';

export const authRouter = Router();
const requestSchema = z.object({ phone: z.string().min(8).max(24), purpose: z.enum(['login','registration','phone-change','password-reset']) });
const verifySchema = z.object({ phone: z.string().min(8).max(24), challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
const passwordSchema = z.string().refine(value => [...value].length >= 15 && [...value].length <= 128 && Buffer.byteLength(value, 'utf8') <= 1024, 'Use a passphrase between 15 and 128 characters.');
const registerSchema = verifySchema.extend({ name: z.string().trim().min(2).max(120), dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), area: z.string().trim().min(2).max(120), nationalId: z.string().trim().min(4).max(40), password: passwordSchema });
const passwordLoginSchema = z.object({ phone: z.string().min(8).max(24), password: z.string().min(1).max(128), accountType: z.enum(['patient','staff']) });
const passwordResetSchema = verifySchema.extend({ password: passwordSchema });

async function consumeOtp(client, { phoneHash, challengeId, code, purpose }) {
  const result = await client.query(`SELECT id,code_hash,attempts,expires_at,consumed_at FROM otp_challenges
    WHERE id=$1 AND phone_lookup_hash=$2 AND purpose=$3 FOR UPDATE`, [challengeId, phoneHash, purpose]);
  const challenge = result.rows[0];
  if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= config.otpMaxAttempts) return false;
  const valid = secureEqualHex(challenge.code_hash, otpHash(challengeId, code));
  if (valid) await client.query('UPDATE otp_challenges SET consumed_at=now() WHERE id=$1', [challengeId]);
  else await client.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1', [challengeId]);
  return valid;
}
async function makeSession(client, user) {
  const id = uuid(); const raw = randomBytes(32).toString('base64url');
  const lifetimeHours = user.role === 'patient' ? 24 * 30 : 8;
  await client.query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+($4::int * interval \'1 hour\'))', [id, user.id, tokenHash(raw), lifetimeHours]);
  return { accessToken: raw, tokenType: 'Bearer', expiresInSeconds: lifetimeHours * 3600, user: { id: user.id, role: user.role } };
}

authRouter.post('/otp/request', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter a phone number and an OTP purpose.' } });
  const phone = normalizePhone(parsed.data.phone); const phoneHash = lookupHash(phone); const purpose = parsed.data.purpose;
  const recent = await query(`SELECT count(*)::int AS count FROM otp_challenges WHERE phone_lookup_hash=$1 AND created_at>now()-interval '30 minutes'`, [phoneHash]);
  if (recent.rows[0].count >= 5) return res.status(429).json({ error: { code: 'OTP_RATE_LIMIT', message: 'Too many codes requested. Try again later.' } });
  const exists = purpose === 'registration'
    ? (await query('SELECT id FROM app_users WHERE phone_lookup_hash=$1', [phoneHash])).rowCount === 0
    : purpose === 'login'
      ? (await query("SELECT id FROM app_users WHERE phone_lookup_hash=$1 AND active=TRUE AND role='patient'", [phoneHash])).rowCount > 0
      : purpose === 'phone-change'
        ? (await query('SELECT id FROM app_users WHERE phone_lookup_hash=$1', [phoneHash])).rowCount === 0
        : (await query('SELECT id FROM app_users WHERE phone_lookup_hash=$1 AND active=TRUE', [phoneHash])).rowCount > 0;
  const challengeId = uuid(); const code = createOtp();
  await query(`INSERT INTO otp_challenges(id,phone_lookup_hash,purpose,code_hash,expires_at)
    VALUES($1,$2,$3,$4,now()+($5::int * interval '1 second'))`, [challengeId, phoneHash, purpose, otpHash(challengeId, code), config.otpTtlSeconds]);
  if (exists) {
    try { await sendOtp(phone, code, config.otpTtlSeconds); }
    catch (error) { await query('UPDATE otp_challenges SET consumed_at=now() WHERE id=$1', [challengeId]); console.error('OTP provider error:', error.message); return res.status(503).json({ error: { code: 'OTP_UNAVAILABLE', message: 'Could not send a verification code right now.' } }); }
  }
  return res.status(202).json({ challengeId, expiresInSeconds: config.otpTtlSeconds, message: 'If the account can use this sign-in method, a code has been sent.' });
});

authRouter.post('/otp/verify', async (req, res) => {
  const parsed = verifySchema.extend({ purpose: z.enum(['login','staff-login']).default('login') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'The verification details are incomplete.' } });
  const phone = normalizePhone(parsed.data.phone); const phoneHash = lookupHash(phone);
  const result = await transaction(async client => {
    if (!await consumeOtp(client, { phoneHash, challengeId: parsed.data.challengeId, code: parsed.data.code, purpose: parsed.data.purpose })) return null;
    const found = await client.query('SELECT id,role,active FROM app_users WHERE phone_lookup_hash=$1', [phoneHash]);
    if (!found.rows[0]?.active || (parsed.data.purpose === 'login' ? found.rows[0].role !== 'patient' : found.rows[0].role === 'patient')) return null;
    const session = await makeSession(client, found.rows[0]);
    return { session, userId: found.rows[0].id };
  });
  if (!result) return res.status(401).json({ error: { code: 'OTP_INVALID', message: 'The code is invalid or expired. Request a new code.' } });
  req.user = { id: result.userId };
  await audit(req, parsed.data.purpose === 'staff-login' ? 'auth.login.staff-mfa' : 'auth.login.otp', 'user', result.userId);
  return res.json(result.session);
});

authRouter.post('/password/login', async (req, res) => {
  const parsed = passwordLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter your phone number and password.' } });
  const phone = normalizePhone(parsed.data.phone); const phoneHash = lookupHash(phone);
  const found = await query('SELECT id,role,active,password_hash FROM app_users WHERE phone_lookup_hash=$1', [phoneHash]);
  const user = found.rows[0];
  if (!user?.active || !user.password_hash || !(await verifyPassword(parsed.data.password, user.password_hash)) || (parsed.data.accountType === 'patient' ? user.role !== 'patient' : user.role === 'patient')) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Phone number or password is incorrect.' } });
  }
  if (parsed.data.accountType === 'patient') {
    const session = await transaction(client => makeSession(client, user));
    req.user = { id: user.id }; await audit(req, 'auth.login.password', 'user', user.id);
    return res.json(session);
  }
  const challengeId = uuid(); const code = createOtp();
  await query(`INSERT INTO otp_challenges(id,phone_lookup_hash,purpose,code_hash,expires_at)
    VALUES($1,$2,'staff-login',$3,now()+($4::int * interval '1 second'))`, [challengeId, phoneHash, otpHash(challengeId, code), config.otpTtlSeconds]);
  try { await sendOtp(phone, code, config.otpTtlSeconds); }
  catch (error) { await query('UPDATE otp_challenges SET consumed_at=now() WHERE id=$1', [challengeId]); console.error('Staff login OTP provider error:', error.message); return res.status(503).json({ error: { code: 'OTP_UNAVAILABLE', message: 'Could not send a verification code right now.' } }); }
  req.user = { id: user.id }; await audit(req, 'auth.login.staff-password', 'user', user.id);
  return res.status(202).json({ requiresOtp: true, challengeId, expiresInSeconds: config.otpTtlSeconds });
});

authRouter.post('/password/reset', async (req, res) => {
  const parsed = passwordResetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter a valid phone verification and a passphrase of at least 15 characters.' } });
  const phone = normalizePhone(parsed.data.phone); const phoneHash = lookupHash(phone);
  const verified = await transaction(async client => {
    if (!await consumeOtp(client, { phoneHash, challengeId: parsed.data.challengeId, code: parsed.data.code, purpose: 'password-reset' })) return null;
    const found = await client.query('SELECT id,role,active FROM app_users WHERE phone_lookup_hash=$1 FOR UPDATE', [phoneHash]);
    if (!found.rows[0]?.active) return null;
    return { id: found.rows[0].id, role: found.rows[0].role };
  });
  if (!verified) return res.status(401).json({ error: { code: 'OTP_INVALID', message: 'The code is invalid or expired. Request a new code.' } });
  const passwordHash = await hashPassword(parsed.data.password);
  const result = await transaction(async client => {
    const changed = await client.query('UPDATE app_users SET password_hash=$2 WHERE id=$1 AND active=TRUE', [verified.id, passwordHash]);
    if (!changed.rowCount) return false;
    await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [verified.id]);
    return true;
  });
  if (!result) return res.status(401).json({ error: { code: 'OTP_INVALID', message: 'The account is unavailable. Request a new code.' } });
  req.user = { id: verified.id }; await audit(req, 'auth.password.reset', verified.role === 'patient' ? 'patient' : 'user', verified.id);
  return res.json({ changed: true });
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Check the registration details and try again.' } });
  const phone = normalizePhone(parsed.data.phone); const phoneHash = lookupHash(phone);
  const verified = await transaction(client => consumeOtp(client, { phoneHash, challengeId: parsed.data.challengeId, code: parsed.data.code, purpose: 'registration' }));
  if (!verified) return res.status(401).json({ error: { code: 'OTP_INVALID', message: 'The code is invalid or expired. Request a new code.' } });
  const passwordHash = await hashPassword(parsed.data.password);
  const result = await transaction(async client => {
    const id = uuid(); const hospitalNumber = `MF-${id.slice(0, 8).toUpperCase()}`;
    const profile = { dob: parsed.data.dob, area: parsed.data.area, nationalId: parsed.data.nationalId, bloodGroup: null, allergies: [], conditions: [], currentMedication: [] };
    await client.query('INSERT INTO app_users(id,phone_lookup_hash,phone_encrypted,name_encrypted,password_hash,role) VALUES($1,$2,$3,$4,$5,\'patient\')', [id, phoneHash, encryptJson(phone), encryptJson(parsed.data.name), passwordHash]);
    await client.query('INSERT INTO patients(user_id,hospital_number,profile_encrypted) VALUES($1,$2,$3)', [id, hospitalNumber, encryptJson(profile)]);
    return { session: await makeSession(client, { id, role: 'patient' }), userId: id, hospitalNumber };
  });
  req.user = { id: result.userId };
  await audit(req, 'patient.register', 'patient', result.userId);
  return res.status(201).json({ ...result.session, user: { ...result.session.user, hospitalNumber: result.hospitalNumber } });
});

authRouter.post('/phone-change', authenticate, async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ error: { code: 'PATIENT_ONLY', message: 'Patient account required.' } });
  const parsed = verifySchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter the new phone number and verification code.' } });
  const phone = normalizePhone(parsed.data.phone); const phoneHash = lookupHash(phone);
  const changed = await transaction(async client => {
    if (!await consumeOtp(client, { phoneHash, challengeId: parsed.data.challengeId, code: parsed.data.code, purpose: 'phone-change' })) return { error: 'otp' };
    try { await client.query('UPDATE app_users SET phone_lookup_hash=$2,phone_encrypted=$3 WHERE id=$1', [req.user.id, phoneHash, encryptJson(phone)]); return { ok: true }; }
    catch (error) { if (error.code === '23505') return { error: 'taken' }; throw error; }
  });
  if (changed.error === 'otp') return res.status(401).json({ error: { code: 'OTP_INVALID', message: 'The code is invalid or expired. Request a new code.' } });
  if (changed.error === 'taken') return res.status(409).json({ error: { code: 'PHONE_IN_USE', message: 'That phone number is already linked to another account.' } });
  await audit(req, 'patient.phone.update', 'patient', req.user.id); return res.json({ phone });
});

authRouter.post('/logout', authenticate, async (req, res) => {
  await query('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL', [req.user.sessionId]);
  await audit(req, 'auth.logout', 'user', req.user.id);
  return res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  const result = await query(`SELECT u.id,u.role,u.name_encrypted,p.hospital_number,p.profile_encrypted
    FROM app_users u LEFT JOIN patients p ON p.user_id=u.id WHERE u.id=$1 AND u.active=TRUE`, [req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Account not found.' } });
  const row = result.rows[0]; await audit(req, 'patient.profile.read', row.role === 'patient' ? 'patient' : 'user', row.id);
  return res.json({ id: row.id, role: row.role, name: decryptJson(row.name_encrypted), hospitalNumber: row.hospital_number ?? null, profile: row.profile_encrypted ? decryptJson(row.profile_encrypted) : null });
});
