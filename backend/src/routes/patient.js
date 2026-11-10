import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { audit } from '../middleware.js';
import { calculateWaitMinutes, decryptJson, encryptJson, parseLocalDateTime, uuid } from '../utils.js';

export const patientRouter = Router();
const routeStages = { 'walk-in': 'triage', appointment: 'triage', 'follow-up': 'triage', results: 'consultation', refill: 'pharmacy', pay: 'checkout' };
const routeSchema = z.object({ routeId: z.enum(['walk-in','appointment','follow-up','results','refill','pay']), complaint: z.string().max(1000).optional().default(''), appointmentId: z.string().uuid().optional() });
const appointmentSchema = z.object({ clinic: z.string().trim().min(2).max(100), doctor: z.string().trim().min(2).max(100), date: z.string(), time: z.string() });
const orderApprovalSchema = z.object({ approvedCodes: z.array(z.string().min(1).max(80)).max(20) });
const profileSchema = z.object({ area: z.string().trim().min(2).max(120), notifyPref: z.enum(['push+sms','sms']).optional() });
const historyRequestSchema = z.object({ note: z.string().trim().max(300).default('') });

function checkPatient(req, res) {
  if (req.user.role !== 'patient') { res.status(403).json({ error: { code: 'PATIENT_ONLY', message: 'This action is for patient accounts.' } }); return false; }
  return true;
}
function localDateTime(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

patientRouter.get('/appointments', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const result = await query('SELECT id,clinic,doctor,scheduled_at,status,created_at FROM appointments WHERE patient_id=$1 ORDER BY scheduled_at DESC', [req.user.id]);
  await audit(req, 'patient.appointments.read', 'patient', req.user.id);
  return res.json({ appointments: result.rows.map(row => ({ id: row.id, clinic: row.clinic, doctor: row.doctor, scheduledAt: row.scheduled_at, localDateTime: localDateTime(row.scheduled_at), status: row.status })) });
});
patientRouter.patch('/profile', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const parsed = profileSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_PROFILE', message: 'Enter a valid phone number and area.' } });
  const profile = await query('SELECT profile_encrypted FROM patients WHERE user_id=$1', [req.user.id]);
  if (!profile.rowCount) return res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient record not found.' } });
  const updatedProfile = { ...decryptJson(profile.rows[0].profile_encrypted), area: parsed.data.area, ...(parsed.data.notifyPref ? { notifyPref: parsed.data.notifyPref } : {}) };
  await query('UPDATE patients SET profile_encrypted=$2 WHERE user_id=$1', [req.user.id, encryptJson(updatedProfile)]);
  await audit(req, 'patient.profile.update', 'patient', req.user.id); return res.json({ profile: updatedProfile });
});
patientRouter.get('/history-requests', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const rows = await query('SELECT id,note_encrypted,status,created_at FROM medical_history_requests WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  await audit(req, 'patient.history-requests.read', 'patient', req.user.id);
  return res.json({ requests: rows.rows.map(row => ({ id: row.id, note: row.note_encrypted ? decryptJson(row.note_encrypted) : '', status: row.status, createdAt: row.created_at })) });
});
patientRouter.post('/history-requests', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const parsed = historyRequestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Enter a short optional reason.' } });
  const id = uuid(); const result = await query('INSERT INTO medical_history_requests(id,patient_id,note_encrypted) VALUES($1,$2,$3) RETURNING created_at', [id, req.user.id, parsed.data.note ? encryptJson(parsed.data.note) : null]);
  await audit(req, 'patient.history-request.create', 'history-request', id);
  return res.status(201).json({ request: { id, note: parsed.data.note, status: 'requested', createdAt: result.rows[0].created_at } });
});
// Single source of truth for clinical service codes and patient-facing prices.
patientRouter.get('/catalog', async (req, res) => {
  if (!['patient','nurse','doctor','lab','pharmacist','cashier','admin'].includes(req.user.role)) return res.status(403).json({ error: { code: 'ROLE_REQUIRED', message: 'An authenticated account is required.' } });
  const result = await query('SELECT code,name,kind,price_kes,inventory_quantity FROM service_catalog WHERE active=TRUE ORDER BY kind,name');
  return res.json({ items: result.rows.map(item => ({ code: item.code, name: item.name, kind: item.kind, priceKes: item.price_kes, inventoryQuantity: item.inventory_quantity })) });
});
patientRouter.post('/appointments', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const parsed = appointmentSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter a clinic, doctor, date and time.' } });
  let scheduledAt; try { scheduledAt = parseLocalDateTime(parsed.data.date, parsed.data.time); } catch (error) { return res.status(error.status ?? 400).json({ error: { code: error.code ?? 'INVALID_DATE_TIME', message: error.message } }); }
  const stamp = new Date(scheduledAt);
  if (stamp.getTime() <= Date.now() + 5 * 60_000 || stamp.getTime() > Date.now() + 180 * 86400_000) return res.status(400).json({ error: { code: 'APPOINTMENT_RANGE', message: 'Choose a time at least five minutes from now and within the next six months.' } });
  const id = uuid();
  try {
    const result = await query(`INSERT INTO appointments(id,patient_id,clinic,doctor,scheduled_at)
      SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE doctor=$4 AND scheduled_at=$5 AND status='booked') RETURNING id,clinic,doctor,scheduled_at,status`, [id, req.user.id, parsed.data.clinic, parsed.data.doctor, scheduledAt]);
    if (!result.rowCount) return res.status(409).json({ error: { code: 'SLOT_TAKEN', message: 'That appointment time is no longer available.' } });
    await audit(req, 'patient.appointment.create', 'appointment', id);
    return res.status(201).json({ appointment: { ...result.rows[0], scheduledAt: result.rows[0].scheduled_at } });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ error: { code: 'SLOT_TAKEN', message: 'That appointment time is no longer available.' } }); throw error; }
});
patientRouter.post('/appointments/:id/cancel', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const result = await query(`UPDATE appointments SET status='cancelled',cancelled_at=now() WHERE id=$1 AND patient_id=$2 AND status='booked' AND scheduled_at>now() RETURNING id`, [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'The upcoming appointment was not found.' } });
  await audit(req, 'patient.appointment.cancel', 'appointment', req.params.id); return res.status(204).end();
});
patientRouter.post('/appointments/:id/reschedule', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const parsed = appointmentSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter a clinic, doctor, date and time.' } });
  let scheduledAt; try { scheduledAt = parseLocalDateTime(parsed.data.date, parsed.data.time); } catch (error) { return res.status(error.status ?? 400).json({ error: { code: error.code ?? 'INVALID_DATE_TIME', message: error.message } }); }
  if (new Date(scheduledAt).getTime() <= Date.now() + 5 * 60_000) return res.status(400).json({ error: { code: 'APPOINTMENT_RANGE', message: 'Choose a time at least five minutes from now.' } });
  try {
    const result = await query(`UPDATE appointments SET clinic=$3,doctor=$4,scheduled_at=$5
      WHERE id=$1 AND patient_id=$2 AND status='booked' AND scheduled_at>now()
      RETURNING id,clinic,doctor,scheduled_at,status`, [req.params.id, req.user.id, parsed.data.clinic, parsed.data.doctor, scheduledAt]);
    if (!result.rowCount) return res.status(404).json({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'The upcoming appointment was not found.' } });
    await audit(req, 'patient.appointment.reschedule', 'appointment', req.params.id);
    return res.json({ appointment: { id: result.rows[0].id, clinic: result.rows[0].clinic, doctor: result.rows[0].doctor, scheduledAt: result.rows[0].scheduled_at, status: result.rows[0].status } });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ error: { code: 'SLOT_TAKEN', message: 'That appointment time is no longer available.' } }); throw error; }
});

patientRouter.post('/visits', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const parsed = routeSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Choose a valid visit type.' } });
  const { routeId, complaint, appointmentId } = parsed.data;
  if (routeId === 'appointment' && !appointmentId) return res.status(400).json({ error: { code: 'APPOINTMENT_REQUIRED', message: 'Select the appointment for this visit.' } });
  const result = await transaction(async client => {
    const active = await client.query("SELECT id FROM visits WHERE patient_id=$1 AND status='active' FOR UPDATE", [req.user.id]);
    if (active.rowCount) return { conflict: active.rows[0].id };
    if (appointmentId) {
      const appointment = await client.query("SELECT id FROM appointments WHERE id=$1 AND patient_id=$2 AND status='booked' AND scheduled_at>now()-interval '2 hours' FOR UPDATE", [appointmentId, req.user.id]);
      if (!appointment.rowCount) return { invalidAppointment: true };
    }
    const id = uuid(); const stage = routeStages[routeId];
    await client.query(`INSERT INTO visits(id,patient_id,appointment_id,route_id,stage,complaint_encrypted)
      VALUES($1,$2,$3,$4,$5,$6)`, [id, req.user.id, appointmentId ?? null, routeId, stage, complaint ? encryptJson(complaint) : null]);
    await client.query('INSERT INTO visit_stage_events(id,visit_id,stage) VALUES($1,$2,$3)', [uuid(), id, stage]);
    return { id, stage, routeId };
  });
  if (result.conflict) return res.status(409).json({ error: { code: 'ACTIVE_VISIT', message: 'Finish or cancel the active visit before starting another.', visitId: result.conflict } });
  if (result.invalidAppointment) return res.status(404).json({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'That booked appointment could not be used for check-in.' } });
  await audit(req, 'patient.visit.create', 'visit', result.id);
  return res.status(201).json({ visit: result });
});

patientRouter.get('/visits', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const result = await query(`SELECT id,route_id,status,stage,complaint_encrypted,diagnosis_encrypted,created_at,completed_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('code',code,'description',description,'amountKes',amount_kes,'adjustmentKes',adjustment_kes,'status',status) ORDER BY created_at) FROM charge_lines c WHERE c.visit_id=visits.id),'[]'::jsonb) AS charges
    FROM visits WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
  await audit(req, 'patient.visits.read', 'patient', req.user.id);
  return res.json({ visits: result.rows.map(row => ({ id: row.id, routeId: row.route_id, status: row.status, stage: row.stage, complaint: row.complaint_encrypted ? decryptJson(row.complaint_encrypted) : '', diagnosis: row.diagnosis_encrypted ? decryptJson(row.diagnosis_encrypted) : '', createdAt: row.created_at, completedAt: row.completed_at, charges: row.charges })) });
});

patientRouter.get('/visits/:id', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const result = await query(`SELECT id,patient_id,route_id,status,stage,complaint_encrypted,diagnosis_encrypted,created_at,completed_at,queue_entered_at,called_at
    FROM visits WHERE id=$1 AND patient_id=$2`, [req.params.id, req.user.id]);
  if (!result.rows[0]) return res.status(404).json({ error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
  const row = result.rows[0];
  const queue = row.status === 'active' ? await query('SELECT count(*)::int AS ahead FROM visits WHERE stage=$1 AND status=\'active\' AND queue_entered_at<$2', [row.stage, row.queue_entered_at]) : { rows: [{ ahead: 0 }] };
  const serviceStats = row.status === 'active' ? await query(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (exited_at-entered_at))/60) AS minutes
    FROM visit_stage_events WHERE stage=$1 AND exited_at>now()-interval '30 days' AND exited_at>entered_at`, [row.stage]) : { rows: [{ minutes: 0 }] };
  const serviceMinutes = Math.max(1, Math.round(Number(serviceStats.rows[0].minutes) || 5));
  const staffCount = config.stageStaff[row.stage] ?? 1;
  const estimatedWaitMinutes = calculateWaitMinutes(queue.rows[0].ahead, staffCount, serviceMinutes);
  const orders = await query(`SELECT o.id,o.catalog_code,o.quantity,o.status,o.result_encrypted,o.directions_encrypted,o.created_at,c.name,c.kind,c.price_kes,c.inventory_quantity
    FROM visit_orders o JOIN service_catalog c ON c.code=o.catalog_code WHERE o.visit_id=$1 ORDER BY o.created_at`, [row.id]);
  const charges = await query('SELECT code,description,amount_kes,adjustment_kes,status FROM charge_lines WHERE visit_id=$1 ORDER BY created_at', [row.id]);
  await audit(req, 'patient.visit.read', 'visit', row.id);
  return res.json({ visit: { id: row.id, routeId: row.route_id, status: row.status, stage: row.stage, complaint: row.complaint_encrypted ? decryptJson(row.complaint_encrypted) : '', diagnosis: row.diagnosis_encrypted ? decryptJson(row.diagnosis_encrypted) : '', createdAt: row.created_at, completedAt: row.completed_at, queue: { ahead: queue.rows[0].ahead, called: !!row.called_at, enteredAt: row.queue_entered_at, estimatedWaitMinutes },
    orders: orders.rows.map(item => ({ id: item.id, code: item.catalog_code, name: item.name, kind: item.kind, quantity: item.quantity, status: item.status, priceKes: item.price_kes, inventoryQuantity: item.inventory_quantity, directions: item.directions_encrypted ? decryptJson(item.directions_encrypted) : null, result: item.result_encrypted ? decryptJson(item.result_encrypted) : null })),
    charges: charges.rows.map(item => ({ code: item.code, description: item.description, amountKes: item.amount_kes, adjustmentKes: item.adjustment_kes, status: item.status })) } });
});

patientRouter.get('/visits/:id/vitals', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const ownership = await query('SELECT id FROM visits WHERE id=$1 AND patient_id=$2', [req.params.id, req.user.id]);
  if (!ownership.rowCount) return res.status(404).json({ error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
  const values = await query('SELECT id,values_encrypted,measured_at FROM triage_vitals WHERE visit_id=$1 ORDER BY measured_at', [req.params.id]);
  await audit(req, 'patient.vitals.read', 'visit', req.params.id);
  return res.json({ readings: values.rows.map(item => ({ id: item.id, ...decryptJson(item.values_encrypted), measuredAt: item.measured_at })) });
});

patientRouter.post('/visits/:id/tests/approve', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const parsed=orderApprovalSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_APPROVAL',message:'Select the tests you want to approve.'}});
  const approved=[...new Set(parsed.data.approvedCodes)];if(approved.length!==parsed.data.approvedCodes.length)return res.status(400).json({error:{code:'DUPLICATE_ORDER',message:'A test was selected more than once.'}});
  const result=await transaction(async client=>{
    const visit=await client.query("SELECT id,stage FROM visits WHERE id=$1 AND patient_id=$2 AND status='active' FOR UPDATE",[req.params.id,req.user.id]);
    if(!visit.rowCount)return {error:'not-found'};if(visit.rows[0].stage!=='test-review')return {error:'wrong-stage'};
    const orders=await client.query("SELECT o.id,o.catalog_code,c.name,c.price_kes FROM visit_orders o JOIN service_catalog c ON c.code=o.catalog_code WHERE o.visit_id=$1 AND o.status='proposed' AND c.kind='lab' FOR UPDATE",[req.params.id]);
    if(approved.some(code=>!orders.rows.some(item=>item.catalog_code===code)))return {error:'invalid-order'};
    for(const item of orders.rows){const accept=approved.includes(item.catalog_code);await client.query('UPDATE visit_orders SET status=$2,approved_at=CASE WHEN $2=\'approved\' THEN now() ELSE NULL END WHERE id=$1',[item.id,accept?'approved':'declined']);if(accept)await client.query('INSERT INTO charge_lines(id,visit_id,source_order_id,code,description,amount_kes) VALUES($1,$2,$3,$4,$5,$6)',[uuid(),req.params.id,item.id,item.catalog_code,item.name,item.price_kes]);}
    await client.query('UPDATE visit_stage_events SET exited_at=now() WHERE visit_id=$1 AND stage=\'test-review\' AND exited_at IS NULL',[req.params.id]);
    const next=approved.length?'laboratory':'results-review';
    await client.query('UPDATE visits SET stage=$2,called_at=NULL,queue_entered_at=now() WHERE id=$1',[req.params.id,next]);
    await client.query('INSERT INTO visit_stage_events(id,visit_id,stage) VALUES($1,$2,$3)',[uuid(),req.params.id,next]);
    return {approvedCodes:approved,nextStage:next};
  });
  if(result.error==='not-found')return res.status(404).json({error:{code:'VISIT_NOT_FOUND',message:'Active visit not found.'}});
  if(result.error==='wrong-stage')return res.status(409).json({error:{code:'WRONG_STAGE',message:'Test review is not the current visit stage.'}});
  if(result.error==='invalid-order')return res.status(422).json({error:{code:'INVALID_ORDER',message:'One or more selected tests were not recommended by the doctor.'}});
  await audit(req,'patient.tests.approve','visit',req.params.id);return res.json({approvedCodes:result.approvedCodes,nextStage:result.nextStage});
});

patientRouter.post('/visits/:id/prescriptions/approve', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const parsed=orderApprovalSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_APPROVAL',message:'Select the medicines you want to approve.'}});
  const approved=[...new Set(parsed.data.approvedCodes)];if(approved.length!==parsed.data.approvedCodes.length)return res.status(400).json({error:{code:'DUPLICATE_ORDER',message:'A medicine was selected more than once.'}});
  const result=await transaction(async client=>{
    const visit=await client.query("SELECT id,stage FROM visits WHERE id=$1 AND patient_id=$2 AND status='active' FOR UPDATE",[req.params.id,req.user.id]);
    if(!visit.rowCount)return {error:'not-found'};if(visit.rows[0].stage!=='results-review')return {error:'wrong-stage'};
    const orders=await client.query("SELECT o.id,o.catalog_code,c.name,c.price_kes FROM visit_orders o JOIN service_catalog c ON c.code=o.catalog_code WHERE o.visit_id=$1 AND o.status='proposed' AND c.kind='medicine' FOR UPDATE",[req.params.id]);
    if(approved.some(code=>!orders.rows.some(item=>item.catalog_code===code)))return {error:'invalid-order'};
    for(const item of orders.rows){const accept=approved.includes(item.catalog_code);await client.query('UPDATE visit_orders SET status=$2,approved_at=CASE WHEN $2=\'approved\' THEN now() ELSE NULL END WHERE id=$1',[item.id,accept?'approved':'declined']);if(accept)await client.query('INSERT INTO charge_lines(id,visit_id,source_order_id,code,description,amount_kes) VALUES($1,$2,$3,$4,$5,$6)',[uuid(),req.params.id,item.id,item.catalog_code,item.name,item.price_kes]);}
    await client.query('UPDATE visit_stage_events SET exited_at=now() WHERE visit_id=$1 AND stage=\'results-review\' AND exited_at IS NULL',[req.params.id]);
    const next=approved.length?'pharmacy':'checkout';
    await client.query('UPDATE visits SET stage=$2,called_at=NULL,queue_entered_at=now() WHERE id=$1',[req.params.id,next]);
    await client.query('INSERT INTO visit_stage_events(id,visit_id,stage) VALUES($1,$2,$3)',[uuid(),req.params.id,next]);return {approvedCodes:approved,nextStage:next};
  });
  if(result.error==='not-found')return res.status(404).json({error:{code:'VISIT_NOT_FOUND',message:'Active visit not found.'}});
  if(result.error==='wrong-stage')return res.status(409).json({error:{code:'WRONG_STAGE',message:'Doctor review is not the current visit stage.'}});
  if(result.error==='invalid-order')return res.status(422).json({error:{code:'INVALID_ORDER',message:'One or more selected medicines were not prescribed.'}});
  await audit(req,'patient.prescriptions.approve','visit',req.params.id);return res.json({approvedCodes:result.approvedCodes,nextStage:result.nextStage});
});

patientRouter.post('/visits/:id/complete-free',async(req,res)=>{
  if(!checkPatient(req,res))return;
  const result=await transaction(async client=>{
    const visit=await client.query("SELECT id,stage FROM visits WHERE id=$1 AND patient_id=$2 AND status='active' FOR UPDATE",[req.params.id,req.user.id]);
    if(!visit.rowCount)return {error:'not-found'};if(visit.rows[0].stage!=='checkout')return {error:'wrong-stage'};
    const due=await client.query("SELECT amount_kes,adjustment_kes FROM charge_lines WHERE visit_id=$1 AND status='due' FOR UPDATE",[req.params.id]);
    if(due.rows.some(line=>line.amount_kes-line.adjustment_kes>0))return {error:'amount-due'};
    await client.query("UPDATE charge_lines SET status='waived' WHERE visit_id=$1 AND status='due'",[req.params.id]);
    await client.query("UPDATE visit_stage_events SET exited_at=now() WHERE visit_id=$1 AND stage='checkout' AND exited_at IS NULL",[req.params.id]);
    await client.query("UPDATE visits SET status='completed',completed_at=now() WHERE id=$1",[req.params.id]);return {ok:true};
  });
  if(result.error==='not-found')return res.status(404).json({error:{code:'VISIT_NOT_FOUND',message:'Active visit not found.'}});
  if(result.error==='wrong-stage')return res.status(409).json({error:{code:'WRONG_STAGE',message:'Visit is not at checkout.'}});
  if(result.error==='amount-due')return res.status(409).json({error:{code:'AMOUNT_DUE',message:'The visit still has an amount due.'}});
  await audit(req,'patient.visit.complete-free','visit',req.params.id);return res.json({completed:true,amountKes:0});
});

patientRouter.get('/health-trends', async (req, res) => {
  if (!checkPatient(req, res)) return;
  const values = await query(`SELECT v.id AS visit_id,t.id,t.values_encrypted,t.measured_at FROM triage_vitals t
    JOIN visits v ON v.id=t.visit_id WHERE v.patient_id=$1 AND t.measured_at>=now()-interval '6 months' ORDER BY t.measured_at`, [req.user.id]);
  await audit(req, 'patient.health-trends.read', 'patient', req.user.id);
  return res.json({ period: 'P6M', readings: values.rows.map(item => ({ id: item.id, visitId: item.visit_id, ...decryptJson(item.values_encrypted), measuredAt: item.measured_at })) });
});
