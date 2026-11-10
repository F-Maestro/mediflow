import 'dotenv/config';

const bool = (value, fallback = false) => value === undefined ? fallback : value.toLowerCase() === 'true';
const required = (name, value) => { if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; };
const list = value => (value ?? '').split(',').map(x => x.trim()).filter(Boolean);

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  publicApiUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:4000',
  appOrigins: list(process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:8081'),
  timeZone: process.env.FACILITY_TIME_ZONE ?? 'Africa/Nairobi',
  databaseUrl: required('DATABASE_URL', process.env.DATABASE_URL),
  databaseSsl: bool(process.env.DATABASE_SSL),
  sessionPepper: required('SESSION_PEPPER', process.env.SESSION_PEPPER),
  otpHmacKey: required('OTP_HMAC_KEY', process.env.OTP_HMAC_KEY),
  dataEncryptionKey: required('DATA_ENCRYPTION_KEY', process.env.DATA_ENCRYPTION_KEY),
  otpProvider: process.env.OTP_PROVIDER ?? 'console',
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
  atUsername: process.env.AT_USERNAME,
  atApiKey: process.env.AT_API_KEY,
  atSenderId: process.env.AT_SENDER_ID,
  atEnv: process.env.AT_ENV ?? 'sandbox',
  mpesaProvider: process.env.MPESA_PROVIDER ?? 'mock',
  mpesaEnv: process.env.MPESA_ENV ?? 'sandbox',
  mpesaConsumerKey: process.env.MPESA_CONSUMER_KEY,
  mpesaConsumerSecret: process.env.MPESA_CONSUMER_SECRET,
  mpesaShortCode: process.env.MPESA_SHORT_CODE,
  mpesaPasskey: process.env.MPESA_PASSKEY,
  mpesaCallbackUrl: process.env.MPESA_CALLBACK_URL,
  mpesaTransactionType: process.env.MPESA_TRANSACTION_TYPE ?? 'CustomerPayBillOnline',
  whatsappProvider: process.env.WHATSAPP_PROVIDER ?? 'mock',
  whatsappGraphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  whatsappTeamNumber: process.env.WHATSAPP_TEAM_NUMBER,
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET,
  stageStaff: { triage: Number(process.env.TRIAGE_STAFF_COUNT ?? 1), consultation: Number(process.env.CONSULTATION_STAFF_COUNT ?? 2), laboratory: Number(process.env.LAB_STAFF_COUNT ?? 2), pharmacy: Number(process.env.PHARMACY_STAFF_COUNT ?? 1) },
};

if (config.nodeEnv === 'production' && (config.otpProvider === 'console' || config.mpesaProvider === 'mock' || config.whatsappProvider === 'mock')) {
  throw new Error('Production mode refuses console/mock OTP, payment, or WhatsApp providers. Configure live integrations first.');
}
if (!Number.isSafeInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be a valid TCP port.');
