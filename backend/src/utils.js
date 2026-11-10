import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';

const encryptionKey = Buffer.from(config.dataEncryptionKey, 'base64');
if (encryptionKey.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be base64 encoding of exactly 32 random bytes.');

export const uuid = () => randomUUID();
export function normalizePhone(input) {
  let phone = String(input ?? '').replace(/[\s()-]/g, '');
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (phone.startsWith('0')) phone = '+254' + phone.slice(1);
  else if (phone.startsWith('254')) phone = '+' + phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw Object.assign(new Error('Enter a valid phone number in international format.'), { status: 400, code: 'INVALID_PHONE' });
  return phone;
}
export const lookupHash = value => createHmac('sha256', config.otpHmacKey).update(String(value)).digest('hex');
export const tokenHash = value => createHmac('sha256', config.sessionPepper).update(String(value)).digest('hex');
export const otpHash = (challengeId, code) => createHmac('sha256', config.otpHmacKey).update(`${challengeId}:${code}`).digest('hex');
export const createOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const secureEqualHex = (left, right) => { try { const a = Buffer.from(left, 'hex'); const b = Buffer.from(right, 'hex'); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; } };

const scrypt = promisify(scryptCallback);
const PASSWORD_SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, PASSWORD_SCRYPT);
  return `scrypt$${PASSWORD_SCRYPT.N}$${PASSWORD_SCRYPT.r}$${PASSWORD_SCRYPT.p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}
export async function verifyPassword(password, encoded) {
  try {
    const [scheme, n, r, p, saltText, hashText, extra] = String(encoded ?? '').split('$');
    if (scheme !== 'scrypt' || n !== String(PASSWORD_SCRYPT.N) || r !== String(PASSWORD_SCRYPT.r) || p !== String(PASSWORD_SCRYPT.p) || !saltText || !hashText || extra !== undefined) return false;
    const salt = Buffer.from(saltText, 'base64url'); const expected = Buffer.from(hashText, 'base64url');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = Buffer.from(await scrypt(password, salt, expected.length, PASSWORD_SCRYPT));
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function encryptJson(value) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
export function decryptJson(payload) {
  if (!payload || payload.v !== 1) throw new Error('Unsupported or missing encrypted record format.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

export function parseLocalDateTime(date, time, zone = config.timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw Object.assign(new Error('Use a valid date (YYYY-MM-DD) and time (HH:mm).'), { status: 400, code: 'INVALID_DATE_TIME' });
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wanted);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day || hour > 23 || minute > 59) throw Object.assign(new Error('That calendar date or time is not valid.'), { status: 400, code: 'INVALID_DATE_TIME' });
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(wanted));
  const got = Object.fromEntries(parts.map(p => [p.type, Number(p.value)]));
  const asUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute);
  const instant = new Date(wanted - (asUtc - wanted));
  return instant.toISOString();
}

export function calculateWaitMinutes(ahead, servers, serviceMinutes, currentStageRemaining = 0) {
  if (![ahead, servers, serviceMinutes, currentStageRemaining].every(Number.isFinite) || ahead < 0 || servers < 1 || serviceMinutes < 0 || currentStageRemaining < 0) throw new RangeError('Wait calculation inputs are invalid.');
  return Math.ceil(ahead / servers) * serviceMinutes + currentStageRemaining;
}
export function sumKes(lines) {
  return lines.reduce((total, line) => {
    if (!Number.isSafeInteger(line.amountKes) || !Number.isSafeInteger(line.adjustmentKes ?? 0)) throw new RangeError('Money values must be whole integer KES.');
    const net = line.amountKes - (line.adjustmentKes ?? 0);
    if (net < 0) throw new RangeError('A discount cannot exceed its charge.');
    const next = total + net;
    if (!Number.isSafeInteger(next)) throw new RangeError('Money total exceeds safe integer range.');
    return next;
  }, 0);
}
