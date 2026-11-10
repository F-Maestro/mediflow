import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { audit, requireRoles } from '../middleware.js';
import { calculateWaitMinutes, decryptJson, encryptJson, uuid } from '../utils.js';

export const staffRouter = Router();
const stageNames = ['triage','consultation','test-review','laboratory','results-review','pharmacy','checkout'];
const defaultMinutes = { triage: 3, consultation: 8, 'test-review': 1, laboratory: 20, 'results-review': 5, pharmacy: 4, checkout: 2 };
const roleStages = { nurse: ['triage'], doctor: ['consultation','results-review'], lab: ['laboratory'], pharmacist: ['pharmacy'], cashier: ['checkout'] };
const staffRoles = ['nurse','doctor','lab','pharmacist','cashier','admin'];
const number = z.number().finite();
const vitalsSchema = z.object({ bloodPressureSystolic: number.int().min(50).max(300).nullable().optional(), bloodPressureDiastolic: number.int().min(30).max(200).nullable().optional(), heartRate: number.int().min(20).max(250).nullable().optional(), weightKg: number.min(1).max(500).nullable().optional(), temperatureC: number.min(30).max(45).nullable().optional() });
const diagnosisSchema = z.object({ diagnosis: z.string().trim().min(2).max(2000), labCodes: z.array(z.string().min(1).max(80)).max(20).default([]) });
const prescriptionSchema = z.object({ medicines: z.array(z.object({ code: z.string().min(1).max(80), directions: z.string().trim().min(3).max(500) })).max(20) });
const resultSchema = z.object({ result: z.string().trim().min(1).max(4000) });
const waiverSchema = z.object({ percent: z.number().int().min(1).max(100), reason: z.string().trim().min(3).max(160) });
const stockSchema = z.object({ quantity: z.number().int().min(1).max(10000), reason: z.string().trim().min(3).max(160) });
const noteSchema = z.object({ note: z.string().trim().min(1).max(2000) });
const teamMessageSchema = z.object({ visitId: z.string().uuid().optional(), message: z.string().trim().min(1).max(2000) });

const canWork = (req, res, stage) => {
  if (!staffRoles.includes(req.user.role)) { res.status(403).json({ error: { code: 'STAFF_ONLY', message: 'Staff access is required.' } }); return false; }
  if (req.user.role !== 'admin' && !roleStages[req.user.role]?.includes(stage)) { res.status(403).json({ error: { code: 'ROLE_REQUIRED', message: `This action requires the ${stage} desk.` } }); return false; }
  return true;
};
async function enterStage(client, visitId, from, to, actorId) {
  await client.query('UPDATE visit_stage_events SET exited_at=now(),actor_id=$3 WHERE visit_id=$1 AND stage=$2 AND exited_at IS NULL', [visitId, from, actorId]);
  await client.query('UPDATE visits SET stage=$2,called_at=NULL,queue_entered_at=now() WHERE id=$1', [visitId, to]);
  await client.query('INSERT INTO visit_stage_events(id,visit_id,stage,actor_id) VALUES($1,$2,$3,$4)', [uuid(), visitId, to, actorId]);
}
async function addCharge(client, visitId, code, description, sourceOrderId = null) {
  const item = await client.query('SELECT price_kes FROM service_catalog WHERE code=$1 AND active=TRUE', [code]);
  if (!item.rowCount) throw Object.assign(new Error(`Unknown billable catalog code: ${code}`), { status: 422, code: 'CATALOG_ITEM_INVALID' });
  const chargeId = uuid();
  const existing = await client.query('SELECT id FROM charge_lines WHERE visit_id=$1 AND code=$2 AND status IN (\'due\',\'paid\') AND source_order_id IS NOT DISTINCT FROM $3', [visitId, code, sourceOrderId]);
  if (existing.rowCount) return;
  await client.query('INSERT INTO charge_lines(id,visit_id,source_order_id,code,description,amount_kes) VALUES($1,$2,$3,$4,$5,$6)', [chargeId, visitId, sourceOrderId, code, description, item.rows[0].price_kes]);
}
async function getVisitForStaff(client, id, expectedStage = null) {
  const result = await client.query('SELECT id,patient_id,route_id,status,stage FROM visits WHERE id=$1 FOR UPDATE', [id]);
  const visit = result.rows[0];
  if (!visit) return { error: 'not-found' };
  if (visit.status !== 'active') return { error: 'closed' };
  if (expectedStage && visit.stage !== expectedStage) return { error: 'wrong-stage', visit };
  return { visit };
}
function errorResponse(res, error) {
  if (error === 'not-found') return res.status(404).json({ error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
  if (error === 'closed') return res.status(409).json({ error: { code: 'VISIT_CLOSED', message: 'This visit is already closed.' } });
  if (error === 'wrong-stage') return res.status(409).json({ error: { code: 'WRONG_STAGE', message: 'This visit is at a different stage.' } });
}

staffRouter.get('/queue', async (req, res) => {
  if (!staffRoles.includes(req.user.role)) return res.status(403).json({ error: { code: 'STAFF_ONLY', message: 'Staff access is required.' } });
  const counts = await query(`SELECT stage,count(*)::int AS waiting FROM visits WHERE status='active' GROUP BY stage`);
  const values = Object.fromEntries(counts.rows.map(row => [row.stage, row.waiting]));
  const overview = await Promise.all(stageNames.map(async stage => {
    const median = await query(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (exited_at-entered_at))/60) AS minutes
      FROM visit_stage_events WHERE stage=$1 AND exited_at>now()-interval '30 days' AND exited_at>entered_at`, [stage]);
    const serviceMinutes = Math.max(1, Math.round(Number(median.rows[0].minutes) || defaultMinutes[stage]));
    const staff = config.stageStaff[stage] ?? 1;
    return { stage, waiting: values[stage] ?? 0, staff, medianServiceMinutes: serviceMinutes, estimatedWaitMinutes: calculateWaitMinutes(values[stage] ?? 0, staff, serviceMinutes) };
  }));
  return res.json({ updatedAt: new Date().toISOString(), stages: overview });
});

staffRouter.get('/queue/:stage', async (req, res) => {
  const stage = req.params.stage;
  if (!stageNames.includes(stage)) return res.status(400).json({ error: { code: 'INVALID_STAGE', message: 'Unknown queue stage.' } });
  if (!canWork(req, res, stage)) return;
  const [queue, median] = await Promise.all([
    query(`SELECT v.id,v.patient_id,p.hospital_number,u.name_encrypted,v.queue_entered_at,v.called_at,v.complaint_encrypted
      FROM visits v JOIN patients p ON p.user_id=v.patient_id JOIN app_users u ON u.id=v.patient_id
      WHERE v.stage=$1 AND v.status='active' ORDER BY v.queue_entered_at FOR UPDATE OF v`, [stage]),
    query(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (exited_at-entered_at))/60) AS minutes
      FROM visit_stage_events WHERE stage=$1 AND exited_at>now()-interval '30 days' AND exited_at>entered_at`, [stage]),
  ]);
  const serviceMinutes = Math.max(1, Math.round(Number(median.rows[0].minutes) || defaultMinutes[stage]));
  const staffCount = config.stageStaff[stage] ?? 1;
  const rows = queue.rows.map((row,index) => ({ position:index+1, visitId:row.id, patientId:row.patient_id, hospitalNumber:row.hospital_number, name:decryptJson(row.name_encrypted), complaint:row.complaint_encrypted ? decryptJson(row.complaint_encrypted) : '', called:!!row.called_at, enteredAt:row.queue_entered_at }));
  await audit(req, 'staff.queue.read', 'queue');
  return res.json({ stage, waiting: rows.length, staff: staffCount, medianServiceMinutes: serviceMinutes, patients: rows });
});

staffRouter.post('/queue/:stage/call-next', async (req, res) => {
  const stage = req.params.stage;
  if (!stageNames.includes(stage)) return res.status(400).json({ error: { code: 'INVALID_STAGE', message: 'Unknown queue stage.' } });
  if (!canWork(req, res, stage)) return;
  const row = await transaction(async client => {
    const next = await client.query(`SELECT id,patient_id FROM visits WHERE stage=$1 AND status='active' AND called_at IS NULL
      ORDER BY queue_entered_at LIMIT 1 FOR UPDATE SKIP LOCKED`, [stage]);
    if (!next.rows[0]) return null;
    await client.query('UPDATE visits SET called_at=now() WHERE id=$1', [next.rows[0].id]); return next.rows[0];
  });
  if (!row) return res.status(404).json({ error: { code: 'QUEUE_EMPTY', message: 'No uncalled patients are waiting.' } });
  await audit(req, 'staff.queue.call-next', 'visit', row.id); return res.json({ visitId: row.id, patientId: row.patient_id, calledAt: new Date().toISOString() });
});

staffRouter.get('/patients/:id/chart', async (req, res) => {
  if (!canWork(req, res, 'consultation')) return;
  const patient = await query(`SELECT u.id,u.name_encrypted,u.phone_encrypted,p.hospital_number,p.profile_encrypted
    FROM app_users u JOIN patients p ON p.user_id=u.id WHERE u.id=$1`, [req.params.id]);
  if (!patient.rows[0]) return res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient record not found.' } });
  const history = await query(`SELECT id,route_id,status,stage,complaint_encrypted,diagnosis_encrypted,created_at,completed_at
    FROM visits WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.params.id]);
  const vitals = await query(`SELECT t.id,t.visit_id,t.values_encrypted,t.measured_at FROM triage_vitals t JOIN visits v ON v.id=t.visit_id
    WHERE v.patient_id=$1 AND t.measured_at>now()-interval '2 years' ORDER BY t.measured_at DESC LIMIT 100`, [req.params.id]);
  await audit(req, 'staff.patient-chart.read', 'patient', req.params.id);
  const person=patient.rows[0];
  return res.json({ patient: { id:person.id,name:decryptJson(person.name_encrypted),hospitalNumber:person.hospital_number,profile:decryptJson(person.profile_encrypted) },
    visits:history.rows.map(row=>({id:row.id,routeId:row.route_id,status:row.status,stage:row.stage,complaint:row.complaint_encrypted?decryptJson(row.complaint_encrypted):'',diagnosis:row.diagnosis_encrypted?decryptJson(row.diagnosis_encrypted):'',createdAt:row.created_at,completedAt:row.completed_at})),
    vitals:vitals.rows.map(row=>({id:row.id,visitId:row.visit_id,...decryptJson(row.values_encrypted),measuredAt:row.measured_at})) });
});

staffRouter.get('/staff/visits/:id', async (req, res) => {
  const result = await query(`SELECT v.id,v.patient_id,v.route_id,v.status,v.stage,v.complaint_encrypted,v.diagnosis_encrypted,v.created_at,v.queue_entered_at,v.called_at,p.hospital_number,u.name_encrypted
    FROM visits v JOIN patients p ON p.user_id=v.patient_id JOIN app_users u ON u.id=v.patient_id WHERE v.id=$1`, [req.params.id]);
  const row = result.rows[0]; if (!row) return res.status(404).json({ error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
  if (!canWork(req, res, row.stage)) return;
  const [orders, charges] = await Promise.all([
    query(`SELECT o.id,o.catalog_code,o.quantity,o.status,o.result_encrypted,o.directions_encrypted,c.name,c.kind,c.price_kes,c.inventory_quantity FROM visit_orders o JOIN service_catalog c ON c.code=o.catalog_code WHERE o.visit_id=$1 ORDER BY o.created_at`, [row.id]),
    query('SELECT code,description,amount_kes,adjustment_kes,status FROM charge_lines WHERE visit_id=$1 ORDER BY created_at', [row.id]),
  ]);
  await audit(req, 'staff.visit.read', 'visit', row.id);
  return res.json({ visit: { id: row.id, patientId: row.patient_id, patientName: decryptJson(row.name_encrypted), hospitalNumber: row.hospital_number, routeId: row.route_id, status: row.status, stage: row.stage,
    complaint: row.complaint_encrypted ? decryptJson(row.complaint_encrypted) : '', diagnosis: row.diagnosis_encrypted ? decryptJson(row.diagnosis_encrypted) : '', createdAt: row.created_at, queue: { called: !!row.called_at, enteredAt: row.queue_entered_at },
    orders: orders.rows.map(item => ({ id: item.id, code: item.catalog_code, name: item.name, kind: item.kind, quantity: item.quantity, status: item.status, priceKes: item.price_kes, inventoryQuantity: item.inventory_quantity, directions: item.directions_encrypted ? decryptJson(item.directions_encrypted) : null, result: item.result_encrypted ? decryptJson(item.result_encrypted) : null })),
    charges: charges.rows.map(item => ({ code: item.code, description: item.description, amountKes: item.amount_kes, adjustmentKes: item.adjustment_kes, status: item.status })) } });
});

staffRouter.get('/staff/visits/:id/notes', async (req, res) => {
  if (!['doctor','nurse','admin'].includes(req.user.role)) return res.status(403).json({ error: { code: 'ROLE_REQUIRED', message: 'Clinical notes are restricted to care staff.' } });
  const rows = await query(`SELECT n.id,n.note_encrypted,n.created_at,u.name_encrypted FROM clinical_notes n JOIN app_users u ON u.id=n.author_id WHERE n.visit_id=$1 ORDER BY n.created_at DESC LIMIT 100`, [req.params.id]);
  await audit(req, 'staff.clinical-notes.read', 'visit', req.params.id);
  return res.json({ notes: rows.rows.map(row => ({ id: row.id, author: decryptJson(row.name_encrypted), note: decryptJson(row.note_encrypted), createdAt: row.created_at })) });
});
staffRouter.post('/staff/visits/:id/notes', async (req, res) => {
  if (!['doctor','nurse','admin'].includes(req.user.role)) return res.status(403).json({ error: { code: 'ROLE_REQUIRED', message: 'Clinical notes are restricted to care staff.' } });
  const parsed = noteSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_NOTE', message: 'Enter a note of up to 2,000 characters.' } });
  const id = uuid(); const saved = await query('INSERT INTO clinical_notes(id,visit_id,author_id,note_encrypted) SELECT $1,id,$3,$4 FROM visits WHERE id=$2 RETURNING created_at', [id, req.params.id, req.user.id, encryptJson(parsed.data.note)]);
  if (!saved.rowCount) return res.status(404).json({ error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
  await audit(req, 'staff.clinical-note.create', 'visit', req.params.id); return res.status(201).json({ note: { id, note: parsed.data.note, createdAt: saved.rows[0].created_at } });
});
staffRouter.get('/team/messages', async (req, res) => {
  if (!['doctor','nurse','lab','pharmacist','cashier','admin'].includes(req.user.role)) return res.status(403).json({ error: { code: 'STAFF_ONLY', message: 'Staff access is required.' } });
  const visitId = typeof req.query.visitId === 'string' ? req.query.visitId : null;
  const rows = await query(`SELECT m.id,m.visit_id,m.message_encrypted,m.created_at,m.sender_id,u.name_encrypted FROM team_messages m JOIN app_users u ON u.id=m.sender_id
    WHERE ($1::uuid IS NULL AND m.visit_id IS NULL) OR ($1::uuid IS NOT NULL AND m.visit_id=$1) ORDER BY m.created_at DESC LIMIT 100`, [visitId]);
  await audit(req, 'staff.team-messages.read', 'team-message');
  return res.json({ messages: rows.rows.reverse().map(row => ({ id: row.id, visitId: row.visit_id, senderId: row.sender_id, sender: decryptJson(row.name_encrypted), message: decryptJson(row.message_encrypted), createdAt: row.created_at })) });
});
staffRouter.post('/team/messages', async (req, res) => {
  if (!['doctor','nurse','lab','pharmacist','cashier','admin'].includes(req.user.role)) return res.status(403).json({ error: { code: 'STAFF_ONLY', message: 'Staff access is required.' } });
  const parsed = teamMessageSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_MESSAGE', message: 'Enter a message of up to 2,000 characters.' } });
  const id = uuid(); const result = await query('INSERT INTO team_messages(id,visit_id,sender_id,message_encrypted) VALUES($1,$2,$3,$4) RETURNING created_at', [id, parsed.data.visitId ?? null, req.user.id, encryptJson(parsed.data.message)]);
  await audit(req, 'staff.team-message.create', 'team-message', id); return res.status(201).json({ message: { id, message: parsed.data.message, createdAt: result.rows[0].created_at } });
});

staffRouter.post('/visits/:id/triage', async (req, res) => {
  if (!canWork(req, res, 'triage')) return;
  const parsed = vitalsSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_VITALS', message: 'Check the measurement values and allowed ranges.' } });
  const vitals = parsed.data; const hasBp = vitals.bloodPressureSystolic != null || vitals.bloodPressureDiastolic != null;
  if (hasBp && (vitals.bloodPressureSystolic == null || vitals.bloodPressureDiastolic == null)) return res.status(400).json({ error: { code: 'BP_PAIR_REQUIRED', message: 'Record both systolic and diastolic blood pressure.' } });
  if (Object.values(vitals).every(value => value == null)) return res.status(400).json({ error: { code: 'NO_VITALS', message: 'Enter at least one measured vital sign.' } });
  const saved = await transaction(async client => {
    const found=await getVisitForStaff(client,req.params.id,'triage'); if(found.error)return found;
    const vitalId=uuid(); await client.query('INSERT INTO triage_vitals(id,visit_id,measured_by,values_encrypted) VALUES($1,$2,$3,$4)',[vitalId,req.params.id,req.user.id,encryptJson(vitals)]);
    await addCharge(client,req.params.id,'triage','Triage and vital signs');
    await enterStage(client,req.params.id,'triage','consultation',req.user.id);
    return { vitalId,visit:found.visit };
  });
  if(saved.error)return errorResponse(res,saved.error);
  await audit(req,'staff.triage.record','visit',req.params.id);
  return res.status(201).json({reading:{id:saved.vitalId,...vitals,measuredAt:new Date().toISOString()},nextStage:'consultation'});
});

staffRouter.post('/visits/:id/consultation', async (req, res) => {
  if (!canWork(req, res, 'consultation')) return;
  const parsed=diagnosisSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:{code:'INVALID_CONSULTATION',message:'Enter a diagnosis and valid lab-code list.'}});
  const codes=[...new Set(parsed.data.labCodes)]; if(codes.length!==parsed.data.labCodes.length)return res.status(400).json({error:{code:'DUPLICATE_TEST',message:'Each test may only be selected once.'}});
  const saved=await transaction(async client=>{
    const found=await getVisitForStaff(client,req.params.id,'consultation');if(found.error)return found;
    const valid=await client.query("SELECT code,name FROM service_catalog WHERE code=ANY($1::text[]) AND kind='lab' AND active=TRUE",[codes]);
    if(valid.rowCount!==codes.length)return {error:'invalid-catalog'};
    const feeCode=found.visit.route_id==='results'?'consult-review':found.visit.route_id==='follow-up'?'consult-followup':'consult-general';
    await client.query('UPDATE visits SET diagnosis_encrypted=$2 WHERE id=$1',[req.params.id,encryptJson(parsed.data.diagnosis)]);
    await addCharge(client,req.params.id,feeCode,'Doctor consultation');
    for(const code of codes)await client.query("INSERT INTO visit_orders(id,visit_id,catalog_code,status,prescribed_by) VALUES($1,$2,$3,'proposed',$4)",[uuid(),req.params.id,code,req.user.id]);
    await enterStage(client,req.params.id,'consultation','test-review',req.user.id);
    return {codes};
  });
  if(saved.error==='invalid-catalog')return res.status(422).json({error:{code:'CATALOG_ITEM_INVALID',message:'One or more selected tests are unavailable.'}});
  if(saved.error)return errorResponse(res,saved.error);
  await audit(req,'staff.consultation.record','visit',req.params.id);
  return res.json({diagnosisRecorded:true,proposedLabCodes:saved.codes,nextStage:'test-review'});
});

staffRouter.post('/visits/:id/lab-orders/:orderId/result', async(req,res)=>{
  if(!canWork(req,res,'laboratory'))return;
  const parsed=resultSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_RESULT',message:'Enter the completed lab result.'}});
  const updated=await transaction(async client=>{
    const found=await getVisitForStaff(client,req.params.id,'laboratory');if(found.error)return found;
    const row=await client.query("UPDATE visit_orders SET result_encrypted=$3,status='completed' WHERE id=$1 AND visit_id=$2 AND status='approved' RETURNING id",[req.params.orderId,req.params.id,encryptJson(parsed.data.result)]);
    if(!row.rowCount)return {error:'order-not-found'};
    const remaining=await client.query("SELECT count(*)::int AS count FROM visit_orders WHERE visit_id=$1 AND status='approved' AND catalog_code IN (SELECT code FROM service_catalog WHERE kind='lab')",[req.params.id]);
    if(remaining.rows[0].count===0)await enterStage(client,req.params.id,'laboratory','results-review',req.user.id);
    return {allDone:remaining.rows[0].count===0};
  });
  if(updated.error==='order-not-found')return res.status(404).json({error:{code:'LAB_ORDER_NOT_FOUND',message:'Approved lab order not found.'}});
  if(updated.error)return errorResponse(res,updated.error);
  await audit(req,'staff.lab-result.record','visit-order',req.params.orderId);
  return res.json({saved:true,doctorReviewReady:updated.allDone});
});

staffRouter.post('/visits/:id/prescriptions',async(req,res)=>{
  if(!canWork(req,res,'results-review'))return;
  const parsed=prescriptionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_PRESCRIPTIONS',message:'Enter each prescribed medicine and its directions.'}});
  const codes=parsed.data.medicines.map(item=>item.code);if([...new Set(codes)].length!==codes.length)return res.status(400).json({error:{code:'DUPLICATE_MEDICINE',message:'Each medicine may only be selected once.'}});
  const saved=await transaction(async client=>{
    const found=await getVisitForStaff(client,req.params.id,'results-review');if(found.error)return found;
    const valid=await client.query("SELECT code FROM service_catalog WHERE code=ANY($1::text[]) AND kind='medicine' AND active=TRUE",[codes]);if(valid.rowCount!==codes.length)return {error:'invalid-catalog'};
    for(const item of parsed.data.medicines)await client.query("INSERT INTO visit_orders(id,visit_id,catalog_code,status,prescribed_by,directions_encrypted) VALUES($1,$2,$3,'proposed',$4,$5)",[uuid(),req.params.id,item.code,req.user.id,encryptJson(item.directions)]);
    if(codes.length===0)await enterStage(client,req.params.id,'results-review','checkout',req.user.id);
    return {codes};
  });
  if(saved.error==='invalid-catalog')return res.status(422).json({error:{code:'CATALOG_ITEM_INVALID',message:'One or more medicines are unavailable.'}});
  if(saved.error)return errorResponse(res,saved.error);
  await audit(req,'staff.prescriptions.propose','visit',req.params.id);return res.json({proposedMedicineCodes:saved.codes,nextStage:saved.codes.length?'results-review':'checkout'});
});

staffRouter.post('/visits/:id/dispense',async(req,res)=>{
  if(!canWork(req,res,'pharmacy'))return;
  const result=await transaction(async client=>{
    const found=await getVisitForStaff(client,req.params.id,'pharmacy');if(found.error)return found;
    await client.query("SELECT code FROM service_catalog WHERE code IN (SELECT o.catalog_code FROM visit_orders o WHERE o.visit_id=$1 AND o.status='approved') FOR UPDATE",[req.params.id]);
    const pending=await client.query("SELECT o.catalog_code,sum(o.quantity)::int AS quantity,c.inventory_quantity FROM visit_orders o JOIN service_catalog c ON c.code=o.catalog_code WHERE o.visit_id=$1 AND c.kind='medicine' AND o.status='approved' GROUP BY o.catalog_code,c.inventory_quantity",[req.params.id]);
    if(pending.rows.length===0)return {error:'no-meds'};
    const insufficient=pending.rows.find(item=>item.inventory_quantity<item.quantity);if(insufficient)return {error:'out-of-stock',code:insufficient.catalog_code,available:insufficient.inventory_quantity};
    for(const item of pending.rows){await client.query('UPDATE service_catalog SET inventory_quantity=inventory_quantity-$2 WHERE code=$1',[item.catalog_code,item.quantity]);await client.query('INSERT INTO inventory_movements(id,catalog_code,visit_id,actor_id,quantity_delta,reason_encrypted) VALUES($1,$2,$3,$4,$5,$6)',[uuid(),item.catalog_code,req.params.id,req.user.id,-item.quantity,encryptJson('Dispensed for visit')]);}
    await client.query("UPDATE visit_orders SET status='completed' WHERE visit_id=$1 AND status='approved' AND catalog_code IN (SELECT code FROM service_catalog WHERE kind='medicine')",[req.params.id]);
    await enterStage(client,req.params.id,'pharmacy','checkout',req.user.id);return {ok:true};
  });
  if(result.error==='no-meds')return res.status(409).json({error:{code:'NO_PRESCRIPTIONS',message:'There are no approved medicines to dispense.'}});
  if(result.error==='out-of-stock')return res.status(409).json({error:{code:'INSUFFICIENT_STOCK',message:`Insufficient stock for ${result.code}; ${result.available} item(s) are available.`}});
  if(result.error)return errorResponse(res,result.error);
  await audit(req,'staff.pharmacy.dispense','visit',req.params.id);return res.json({dispensed:true,nextStage:'checkout'});
});

staffRouter.post('/catalog/:code/stock', async (req, res) => {
  if (!['pharmacist','admin'].includes(req.user.role)) return res.status(403).json({ error: { code: 'ROLE_REQUIRED', message: 'Pharmacy stock changes require a pharmacist or administrator.' } });
  const parsed = stockSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_STOCK_ADJUSTMENT', message: 'Enter a positive stock quantity and a short reason.' } });
  const result = await transaction(async client => {
    const item = await client.query("SELECT code,inventory_quantity FROM service_catalog WHERE code=$1 AND kind='medicine' AND active=TRUE FOR UPDATE", [req.params.code]);
    if (!item.rowCount) return { error: 'not-found' };
    await client.query('UPDATE service_catalog SET inventory_quantity=inventory_quantity+$2 WHERE code=$1', [req.params.code, parsed.data.quantity]);
    await client.query('INSERT INTO inventory_movements(id,catalog_code,actor_id,quantity_delta,reason_encrypted) VALUES($1,$2,$3,$4,$5)', [uuid(), req.params.code, req.user.id, parsed.data.quantity, encryptJson(parsed.data.reason)]);
    return { inventoryQuantity: item.rows[0].inventory_quantity + parsed.data.quantity };
  });
  if (result.error) return res.status(404).json({ error: { code: 'CATALOG_ITEM_INVALID', message: 'Medicine catalog item not found.' } });
  await audit(req, 'staff.pharmacy.stock-adjust', 'catalog'); return res.json({ code: req.params.code, inventoryQuantity: result.inventoryQuantity });
});

staffRouter.post('/visits/:id/waivers',async(req,res)=>{
  if(!canWork(req,res,'checkout'))return;
  const parsed=waiverSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_WAIVER',message:'Select a valid discount percentage and reason.'}});
  const result=await transaction(async client=>{
    const found=await getVisitForStaff(client,req.params.id,'checkout');if(found.error)return found;
    const lines=await client.query("SELECT id,amount_kes FROM charge_lines WHERE visit_id=$1 AND status='due' FOR UPDATE",[req.params.id]);
    if(!lines.rowCount)return {error:'no-due-charges'};
    const pct=parsed.data.percent;
    let waivedKes=0;
    for(const line of lines.rows){const adjustment=Math.floor(line.amount_kes*pct/100);waivedKes+=adjustment;await client.query('UPDATE charge_lines SET adjustment_kes=$2 WHERE id=$1',[line.id,adjustment]);}
    await client.query('INSERT INTO waiver_events(id,visit_id,authorized_by,percent,reason_encrypted,amount_kes) VALUES($1,$2,$3,$4,$5,$6)',[uuid(),req.params.id,req.user.id,pct,encryptJson(parsed.data.reason),waivedKes]);
    return {affected:lines.rowCount,waivedKes};
  });
  if(result.error==='no-due-charges')return res.status(409).json({error:{code:'NO_DUE_CHARGES',message:'No due charge lines are available for waiver.'}});
  if(result.error)return errorResponse(res,result.error);
  await audit(req,`staff.cashier.waiver.${parsed.data.percent}`, 'visit',req.params.id);return res.json({affectedLines:result.affected,waivedKes:result.waivedKes,percent:parsed.data.percent});
});
