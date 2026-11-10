import { query, pool } from '../db.js';
import { encryptJson, lookupHash, normalizePhone, uuid } from '../utils.js';

function argument(name) { const index=process.argv.indexOf(`--${name}`);return index>=0?process.argv[index+1]:undefined; }
try {
  const rawPhone=argument('phone');const name=argument('name');const role=argument('role')??'admin';
  if(!rawPhone||!name||!['admin','nurse','doctor','lab','pharmacist','cashier'].includes(role))throw new Error('Usage: npm run staff:create -- --phone +2547... --name "Full Name" [--role admin|nurse|doctor|lab|pharmacist|cashier]');
  const phone=normalizePhone(rawPhone);const id=uuid();
  await query('INSERT INTO app_users(id,phone_lookup_hash,phone_encrypted,name_encrypted,role) VALUES($1,$2,$3,$4,$5)',[id,lookupHash(phone),encryptJson(phone),encryptJson(name.trim()),role]);
  console.log(`Created ${role} account ${id}. The staff member signs in using a one-time code.`);
} catch(error) { console.error(error.message);process.exitCode=1; }
finally { await pool.end(); }
