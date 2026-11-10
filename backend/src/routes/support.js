import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { authenticate, audit, requireRoles } from '../middleware.js';
import { decryptJson, encryptJson, lookupHash, normalizePhone, uuid } from '../utils.js';
import { sendWhatsAppText } from '../providers/whatsapp.js';
import { verifyWhatsAppSignature } from '../providers/daraja.js';

export const supportRouter = Router();
export const whatsappWebhookRouter = Router();
const messageSchema=z.object({message:z.string().trim().min(1).max(4000),consentToWhatsApp:z.boolean().default(false)});
const replySchema=z.object({message:z.string().trim().min(1).max(4000)});

supportRouter.post('/support/messages',authenticate,async(req,res)=>{
  if(req.user.role!=='patient')return res.status(403).json({error:{code:'PATIENT_ONLY',message:'Patient account required.'}});
  const parsed=messageSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_MESSAGE',message:'Enter a message of up to 4,000 characters.'}});
  const result=await transaction(async client=>{
    let thread=await client.query("SELECT id FROM support_threads WHERE patient_id=$1 AND status='open' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[req.user.id]);
    let threadId=thread.rows[0]?.id;if(!threadId){threadId=uuid();await client.query('INSERT INTO support_threads(id,patient_id) VALUES($1,$2)',[threadId,req.user.id]);}
    const id=uuid();await client.query(`INSERT INTO support_messages(id,thread_id,sender_id,direction,channel,body_encrypted,external_consent_at)
      VALUES($1,$2,$3,'outbound','app',$4,CASE WHEN $5 THEN now() ELSE NULL END)`,[id,threadId,req.user.id,encryptJson(parsed.data.message),parsed.data.consentToWhatsApp]);
    return {id,threadId};
  });
  await audit(req,'patient.support-message.create','support-thread',result.threadId);
  if(!parsed.data.consentToWhatsApp)return res.status(201).json({messageId:result.id,threadId:result.threadId,delivery:'in-app'});
  if(config.whatsappProvider==='cloud'&&config.whatsappTeamNumber){
    try{const sent=await sendWhatsAppText(config.whatsappTeamNumber,`MediFlow care-team message: ${parsed.data.message}`);await query("UPDATE support_messages SET channel='whatsapp',provider_message_id=$2 WHERE id=$1",[result.id,sent.messageId]);return res.status(201).json({messageId:result.id,threadId:result.threadId,delivery:'whatsapp'});}
    catch(error){console.error('WhatsApp provider error:',error.message);return res.status(202).json({messageId:result.id,threadId:result.threadId,delivery:'in-app',whatsappDelivery:'failed'});}
  }
  if(config.whatsappProvider==='mock'){
    await sendWhatsAppText('254700000000',parsed.data.message);
    return res.status(201).json({messageId:result.id,threadId:result.threadId,delivery:'mock'});
  }
  return res.status(202).json({messageId:result.id,threadId:result.threadId,delivery:'in-app',whatsappDelivery:'not-configured'});
});

supportRouter.get('/support/messages',authenticate,async(req,res)=>{
  if(req.user.role!=='patient')return res.status(403).json({error:{code:'PATIENT_ONLY',message:'Patient account required.'}});
  const rows=await query(`SELECT m.id,m.direction,m.channel,m.body_encrypted,m.created_at,t.id AS thread_id
    FROM support_threads t JOIN support_messages m ON m.thread_id=t.id WHERE t.patient_id=$1 ORDER BY m.created_at DESC LIMIT 200`,[req.user.id]);
  if(rows.rows[0])await audit(req,'patient.support-messages.read','support-thread',rows.rows[0].thread_id);
  return res.json({messages:rows.rows.reverse().map(row=>({id:row.id,threadId:row.thread_id,direction:row.direction,channel:row.channel,message:decryptJson(row.body_encrypted),createdAt:row.created_at}))});
});

supportRouter.get('/support/threads',authenticate,requireRoles('nurse','doctor','admin'),async(req,res)=>{
  const rows=await query(`SELECT t.id,t.patient_id,t.created_at,
      (SELECT max(m.created_at) FROM support_messages m WHERE m.thread_id=t.id) AS updated_at,
      (SELECT m.body_encrypted FROM support_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS latest_message,
      p.hospital_number,u.name_encrypted
    FROM support_threads t JOIN patients p ON p.user_id=t.patient_id JOIN app_users u ON u.id=t.patient_id
    WHERE t.status='open' ORDER BY updated_at DESC NULLS LAST LIMIT 100`);
  await audit(req,'staff.support-threads.read','support-thread');
  return res.json({threads:rows.rows.map(row=>({id:row.id,patientId:row.patient_id,patientName:decryptJson(row.name_encrypted),hospitalNumber:row.hospital_number,lastMessage:row.latest_message?decryptJson(row.latest_message):'',updatedAt:row.updated_at}))});
});

supportRouter.get('/support/threads/:id/messages',authenticate,requireRoles('nurse','doctor','admin'),async(req,res)=>{
  const thread=await query('SELECT id,patient_id FROM support_threads WHERE id=$1',[req.params.id]);if(!thread.rowCount)return res.status(404).json({error:{code:'THREAD_NOT_FOUND',message:'Support thread not found.'}});
  const rows=await query('SELECT id,sender_id,direction,channel,body_encrypted,created_at FROM support_messages WHERE thread_id=$1 ORDER BY created_at LIMIT 300',[req.params.id]);
  await audit(req,'staff.support-thread.read','support-thread',req.params.id);
  return res.json({messages:rows.rows.map(row=>({id:row.id,senderId:row.sender_id,direction:row.direction,channel:row.channel,message:decryptJson(row.body_encrypted),createdAt:row.created_at}))});
});

supportRouter.post('/support/threads/:id/reply',authenticate,requireRoles('nurse','doctor','admin'),async(req,res)=>{
  const parsed=replySchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'INVALID_MESSAGE',message:'Enter a message of up to 4,000 characters.'}});
  const thread=await query('SELECT t.patient_id,u.phone_encrypted FROM support_threads t JOIN app_users u ON u.id=t.patient_id WHERE t.id=$1 AND t.status=\'open\'',[req.params.id]);
  if(!thread.rowCount)return res.status(404).json({error:{code:'THREAD_NOT_FOUND',message:'Open support thread not found.'}});
  const id=uuid();await query("INSERT INTO support_messages(id,thread_id,sender_id,direction,channel,body_encrypted) VALUES($1,$2,$3,'inbound','app',$4)",[id,req.params.id,req.user.id,encryptJson(parsed.data.message)]);
  const recentWhatsApp=await query("SELECT 1 FROM support_messages WHERE thread_id=$1 AND channel='whatsapp' AND direction='inbound' AND created_at>now()-interval '24 hours' LIMIT 1",[req.params.id]);
  let delivery='in-app';
  if(recentWhatsApp.rowCount&&config.whatsappProvider==='cloud'){
    try{const sent=await sendWhatsAppText(decryptJson(thread.rows[0].phone_encrypted),parsed.data.message);await query('UPDATE support_messages SET channel=\'whatsapp\',provider_message_id=$2 WHERE id=$1',[id,sent.messageId]);delivery='whatsapp';}
    catch(error){console.error('WhatsApp reply failed:',error.message);}
  }
  await audit(req,'staff.support-thread.reply','support-thread',req.params.id);
  return res.status(201).json({messageId:id,delivery});
});

whatsappWebhookRouter.get('/webhooks/whatsapp',async(req,res)=>{
  const { 'hub.mode':mode,'hub.verify_token':verifyToken,'hub.challenge':challenge }=req.query;
  if(mode==='subscribe'&&verifyToken===config.whatsappVerifyToken)return res.status(200).send(String(challenge??''));
  return res.sendStatus(403);
});
whatsappWebhookRouter.post('/webhooks/whatsapp',async(req,res)=>{
  if(!verifyWhatsAppSignature(req.rawBody??Buffer.alloc(0),req.get('x-hub-signature-256')))return res.sendStatus(401);
  const entries=req.body?.entry??[];
  for(const entry of entries)for(const change of entry.changes??[])for(const item of change.value?.messages??[]){
    if(item.type!=='text'||typeof item.text?.body!=='string'||!item.from||!item.id)continue;
    let phone;try{phone=normalizePhone(item.from);}catch{continue;}
    const phoneHash=lookupHash(phone);const user=await query("SELECT id FROM app_users WHERE phone_lookup_hash=$1 AND role='patient' AND active=TRUE",[phoneHash]);if(!user.rowCount)continue;
    await transaction(async client=>{
      const prior=await client.query('SELECT id FROM support_messages WHERE provider_message_id=$1',[item.id]);if(prior.rowCount)return;
      let thread=await client.query("SELECT id FROM support_threads WHERE patient_id=$1 AND status='open' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[user.rows[0].id]);
      const threadId=thread.rows[0]?.id??uuid();if(!thread.rows[0])await client.query('INSERT INTO support_threads(id,patient_id) VALUES($1,$2)',[threadId,user.rows[0].id]);
      await client.query("INSERT INTO support_messages(id,thread_id,sender_id,direction,channel,body_encrypted,provider_message_id) VALUES($1,$2,$3,'inbound','whatsapp',$4,$5) ON CONFLICT(provider_message_id) DO NOTHING",[uuid(),threadId,user.rows[0].id,encryptJson(item.text.body),item.id]);
    });
  }
  return res.sendStatus(200);
});
