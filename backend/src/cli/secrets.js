import { randomBytes } from 'node:crypto';
console.log(`SESSION_PEPPER=${randomBytes(32).toString('base64url')}`);
console.log(`OTP_HMAC_KEY=${randomBytes(32).toString('base64url')}`);
console.log(`DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
