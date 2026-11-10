import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { audit, requireRoles } from '../middleware.js';
import { decryptJson, normalizePhone, sumKes, uuid } from '../utils.js';
import { initiateStk, queryStk } from '../providers/daraja.js';

export const paymentRouter = Router();
export const mpesaWebhookRouter = Router();
const stkSchema=z.object({visitId:z.string().uuid()});
const cashSchema=z.object({visitId:z.string().uuid(),receiptReference:z.string().trim().max(80).optional()});

async function completePayment(paymentId, receipt) {
  return transaction(async client=>{
    const found=await client.query("SELECT id,visit_id,amount_kes,status FROM payments WHERE id=$1 FOR UPDATE",[paymentId]);if(!found.rows[0])return {error:'not-found'};
    if(found.rows[0].status==='succeeded'){if(receipt)await client.query('UPDATE payments SET mpesa_receipt=COALESCE(mpesa_receipt,$2) WHERE id=$1',[paymentId,receipt]);return {already:true};}if(found.rows[0].status!=='pending')return {error:'not-pending'};
    const due=await client.query("SELECT amount_kes,adjustment_kes FROM charge_lines WHERE visit_id=$1 AND status='due' FOR UPDATE",[found.rows[0].visit_id]);
    const total=sumKes(due.rows.map(line=>({amountKes:line.amount_kes,adjustmentKes:line.adjustment_kes})));
    if(total!==found.rows[0].amount_kes)return {error:'amount-mismatch'};
    await client.query("UPDATE payments SET status='succeeded',mpesa_receipt=$2,completed_at=now() WHERE id=$1",[paymentId,receipt]);
    await client.query("UPDATE charge_lines SET status='paid' WHERE visit_id=$1 AND status='due'",[found.rows[0].visit_id]);
    await client.query("UPDATE visit_stage_events SET exited_at=now() WHERE visit_id=$1 AND stage='checkout' AND exited_at IS NULL",[found.rows[0].visit_id]);
    await client.query("UPDATE visits SET status='completed',completed_at=now() WHERE id=$1",[found.rows[0].visit_id]);
    return {ok:true};
  });
}
async function queryPendingDarajaPayment(paymentId, checkoutRequestId) {
  const status=await queryStk(checkoutRequestId);
  const resultCode=String(status.ResultCode ?? '');
  if(status.ResponseCode!=='0')return {pending:true};
  if(resultCode==='0')return {succeeded:true};
  if(resultCode) {
    await query("UPDATE payments SET status='failed',failure_code=$2 WHERE id=$1 AND status='pending'",[paymentId,String(status.ResultDesc??'PAYMENT_FAILED').slice(0,120)]);
    return {failed:true};
  }
  return {pending:true};
}

paymentRouter.post('/payments/stk-push',async(req,res)=>{
  if(req.user.role!=='patient')return res.status(403).json({error:{code:'PATIENT_ONLY',message:'Patient account required.'}});
  const parsed=stkSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_PAYMENT',message:'Choose a visit to pay for.'}});
  const idem=req.get('idempotency-key');if(!idem||idem.length>120)return res.status(400).json({error:{code:'IDEMPOTENCY_REQUIRED',message:'Send a unique Idempotency-Key for this payment attempt.'}});
  const visit=await query("SELECT v.id,v.stage,p.user_id AS patient_id,u.phone_encrypted FROM visits v JOIN patients p ON p.user_id=v.patient_id JOIN app_users u ON u.id=v.patient_id WHERE v.id=$1 AND v.patient_id=$2 AND v.status='active'",[parsed.data.visitId,req.user.id]);
  if(!visit.rowCount)return res.status(404).json({error:{code:'VISIT_NOT_FOUND',message:'Active visit not found.'}});
  if(visit.rows[0].stage!=='checkout')return res.status(409).json({error:{code:'NOT_READY_FOR_PAYMENT',message:'This visit has not reached checkout.'}});
  const due=await query("SELECT amount_kes,adjustment_kes FROM charge_lines WHERE visit_id=$1 AND status='due'",[parsed.data.visitId]);
  const amountKes=sumKes(due.rows.map(line=>({amountKes:line.amount_kes,adjustmentKes:line.adjustment_kes})));
  if(amountKes<1)return res.status(409).json({error:{code:'NOTHING_TO_PAY',message:'There are no outstanding charges for this visit.'}});
  const provider=config.mpesaProvider==='daraja'?'daraja':'mock';const paymentId=uuid();
  const inserted=await query(`INSERT INTO payments(id,visit_id,patient_id,provider,amount_kes,idempotency_key)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id,status,amount_kes,checkout_request_id`,[paymentId,parsed.data.visitId,req.user.id,provider,amountKes,idem]);
  let payment=inserted.rows[0];
  if(!payment){const prior=await query('SELECT id,visit_id,patient_id,status,amount_kes,checkout_request_id FROM payments WHERE idempotency_key=$1',[idem]);payment=prior.rows[0];if(!payment||payment.visit_id!==parsed.data.visitId||payment.patient_id!==req.user.id||payment.amount_kes!==amountKes)return res.status(409).json({error:{code:'IDEMPOTENCY_CONFLICT',message:'That idempotency key was used for a different payment.'}});return res.status(202).json({paymentId:payment.id,status:payment.status,amountKes:payment.amount_kes,checkoutRequestId:payment.checkout_request_id});}
  if(provider==='mock'){
    await audit(req,'patient.payment.mock-intent','payment',payment.id);
    return res.status(202).json({paymentId:payment.id,status:'pending',amountKes,provider:'mock',message:'Development mock: use the mock completion endpoint to simulate the provider callback.'});
  }
  try{
    const phone=decryptJson(visit.rows[0].phone_encrypted);
    const result=await initiateStk({phone,amountKes,reference:payment.id,description:'MediFlow visit payment'});
    if(String(result.ResponseCode)!=='0')throw new Error(result.ResponseDescription??'Daraja rejected the STK request.');
    const updated=await query('UPDATE payments SET merchant_request_id=$2,checkout_request_id=$3 WHERE id=$1 RETURNING id,status,amount_kes,checkout_request_id',[payment.id,result.MerchantRequestID,result.CheckoutRequestID]);
    await audit(req,'patient.payment.stk-request','payment',payment.id);
    return res.status(202).json({paymentId:payment.id,status:updated.rows[0].status,amountKes,checkoutRequestId:updated.rows[0].checkout_request_id,message:'Approve the M-Pesa prompt on your phone. Payment status updates after Safaricom confirms it.'});
  }catch(error){await query("UPDATE payments SET status='failed',failure_code='STK_REQUEST_FAILED' WHERE id=$1 AND status='pending'",[payment.id]);console.error('Daraja STK request failed:',error.message);return res.status(502).json({error:{code:'MPESA_UNAVAILABLE',message:'Could not start the M-Pesa prompt. You can retry payment.'}});}
});

paymentRouter.get('/payments/:id',async(req,res)=>{
  if(req.user.role!=='patient'&&!['cashier','admin'].includes(req.user.role))return res.status(403).json({error:{code:'ROLE_REQUIRED',message:'Only the patient or cashier may view this payment.'}});
  const result=await query('SELECT id,patient_id,provider,amount_kes,currency,status,mpesa_receipt,checkout_request_id,created_at,completed_at FROM payments WHERE id=$1',[req.params.id]);
  if(!result.rows[0]||(req.user.role==='patient'&&result.rows[0].patient_id!==req.user.id))return res.status(404).json({error:{code:'PAYMENT_NOT_FOUND',message:'Payment not found.'}});
  const payment=result.rows[0];
  if(payment.status==='pending'&&payment.provider==='daraja'&&payment.checkout_request_id){try{const status=await queryPendingDarajaPayment(payment.id,payment.checkout_request_id);if(status.succeeded)await completePayment(payment.id,null);}catch(error){console.error('Daraja payment reconciliation deferred:',error.message);}}
  const latest=await query('SELECT status,amount_kes,currency,mpesa_receipt,created_at,completed_at FROM payments WHERE id=$1',[payment.id]);
  await audit(req,'payment.status.read','payment',payment.id);return res.json({payment:{id:payment.id,provider:payment.provider,...latest.rows[0]}});
});

paymentRouter.post('/payments/:id/mock-complete',async(req,res)=>{
  if(config.nodeEnv==='production'||config.mpesaProvider!=='mock')return res.sendStatus(404);
  const owner=await query('SELECT id,patient_id,provider FROM payments WHERE id=$1',[req.params.id]);if(!owner.rows[0]||owner.rows[0].patient_id!==req.user.id||owner.rows[0].provider!=='mock')return res.status(404).json({error:{code:'PAYMENT_NOT_FOUND',message:'Mock payment not found.'}});
  const result=await completePayment(req.params.id,`DEMO-${uuid().slice(0,8).toUpperCase()}`);
  if(result.error)return res.status(409).json({error:{code:'PAYMENT_CONFLICT',message:'Payment can no longer be completed.'}});
  await audit(req,'patient.payment.mock-complete','payment',req.params.id);return res.json({status:'succeeded',demo:true});
});

paymentRouter.post('/payments/cash',requireRoles('cashier','admin'),async(req,res)=>{
  const parsed=cashSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_PAYMENT',message:'Choose a visit.'}});
  const result=await transaction(async client=>{
    const visit=await client.query("SELECT id,patient_id,stage,status FROM visits WHERE id=$1 FOR UPDATE",[parsed.data.visitId]);if(!visit.rows[0])return {error:'not-found'};
    if(visit.rows[0].stage!=='checkout'||visit.rows[0].status!=='active')return {error:'wrong-stage'};
    const rows=await client.query("SELECT amount_kes,adjustment_kes FROM charge_lines WHERE visit_id=$1 AND status='due' FOR UPDATE",[parsed.data.visitId]);const total=sumKes(rows.rows.map(row=>({amountKes:row.amount_kes,adjustmentKes:row.adjustment_kes})));
    if(total<1)return {error:'nothing-due'};
    const id=uuid();await client.query("INSERT INTO payments(id,visit_id,patient_id,provider,amount_kes,status,idempotency_key,mpesa_receipt,completed_at) VALUES($1,$2,$3,'cash',$4,'succeeded',$5,$6,now())",[id,parsed.data.visitId,visit.rows[0].patient_id,total,`cash:${id}`,parsed.data.receiptReference??`CASH-${id.slice(0,8)}`]);
    await client.query("UPDATE charge_lines SET status='paid' WHERE visit_id=$1 AND status='due'",[parsed.data.visitId]);
    await client.query("UPDATE visit_stage_events SET exited_at=now(),actor_id=$2 WHERE visit_id=$1 AND stage='checkout' AND exited_at IS NULL",[parsed.data.visitId,req.user.id]);
    await client.query("UPDATE visits SET status='completed',completed_at=now() WHERE id=$1",[parsed.data.visitId]);return {id,total};
  });
  if(result.error==='not-found')return res.status(404).json({error:{code:'VISIT_NOT_FOUND',message:'Visit not found.'}});
  if(result.error==='wrong-stage')return res.status(409).json({error:{code:'WRONG_STAGE',message:'Visit is not at checkout.'}});
  if(result.error==='nothing-due')return res.status(409).json({error:{code:'NOTHING_TO_PAY',message:'No outstanding charges.'}});
  await audit(req,'staff.payment.cash','visit',parsed.data.visitId);return res.status(201).json({paymentId:result.id,status:'succeeded',amountKes:result.total,provider:'cash'});
});

mpesaWebhookRouter.post('/webhooks/mpesa',async(req,res)=>{
  const callback=req.body?.Body?.stkCallback;if(!callback?.CheckoutRequestID)return res.sendStatus(200);
  const payment=await query("SELECT id,amount_kes,status FROM payments WHERE checkout_request_id=$1 AND provider='daraja'",[callback.CheckoutRequestID]);if(!payment.rowCount)return res.sendStatus(200);
  if(payment.rows[0].status!=='pending')return res.sendStatus(200);
  let confirmed;try{confirmed=await queryStk(callback.CheckoutRequestID);}catch(error){console.error('Daraja callback reconciliation deferred:',error.message);return res.sendStatus(200);}
  const callbackCode=String(callback.ResultCode??'');const providerCode=String(confirmed.ResultCode??'');
  if(String(confirmed.ResponseCode)!=='0')return res.sendStatus(200);
  if(callbackCode!=='0'||providerCode!=='0'){
    await query("UPDATE payments SET status='failed',failure_code=$2 WHERE id=$1 AND status='pending'",[payment.rows[0].id,String(callback.ResultDesc??confirmed.ResultDesc??'PAYMENT_FAILED').slice(0,120)]);return res.sendStatus(200);
  }
  const metadata=Object.fromEntries((callback.CallbackMetadata?.Item??[]).map(item=>[item.Name,item.Value]));
  if(!Number.isSafeInteger(Number(metadata.Amount))||Number(metadata.Amount)!==payment.rows[0].amount_kes||!metadata.MpesaReceiptNumber)return res.sendStatus(200);
  try{await completePayment(payment.rows[0].id,String(metadata.MpesaReceiptNumber));}catch(error){console.error('M-Pesa callback could not be reconciled:',error.message);}
  return res.sendStatus(200);
});
