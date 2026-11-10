import { Router } from 'express';
import { query } from '../db.js';
import { audit, requireRoles } from '../middleware.js';

export const analyticsRouter=Router();
analyticsRouter.get('/analytics/overview',requireRoles('admin','cashier'),async(req,res)=>{
  const until=req.query.until?new Date(String(req.query.until)):new Date();
  const since=req.query.since?new Date(String(req.query.since)):new Date(until.getTime()-30*86400_000);
  if(!Number.isFinite(since.getTime())||!Number.isFinite(until.getTime())||since>=until||until.getTime()-since.getTime()>90*86400_000)return res.status(400).json({error:{code:'INVALID_RANGE',message:'Use a valid range up to 90 days.'}});
  const [visits,stageTimes,payments,appointments,byDay]=await Promise.all([
    query('SELECT status,stage,count(*)::int AS count FROM visits WHERE created_at >= $1 AND created_at < $2 GROUP BY status,stage ORDER BY status,stage',[since.toISOString(),until.toISOString()]),
    query(`SELECT stage,count(*)::int AS sample_size,round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (exited_at-entered_at))/60)::numeric,1) AS median_minutes
      FROM visit_stage_events WHERE entered_at >= $1 AND exited_at < $2 AND exited_at>entered_at GROUP BY stage ORDER BY stage`,[since.toISOString(),until.toISOString()]),
    query(`SELECT status,count(*)::int AS count,COALESCE(sum(amount_kes),0)::bigint AS amount_kes
      FROM payments WHERE created_at >= $1 AND created_at < $2 GROUP BY status ORDER BY status`,[since.toISOString(),until.toISOString()]),
    query(`SELECT status,count(*)::int AS count FROM appointments WHERE created_at >= $1 AND created_at < $2 GROUP BY status ORDER BY status`,[since.toISOString(),until.toISOString()]),
    query(`SELECT date_trunc('day',created_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS visits
      FROM visits WHERE created_at >= $1 AND created_at < $2 GROUP BY day ORDER BY day`,[since.toISOString(),until.toISOString()]),
  ]);
  await audit(req,'staff.analytics.read','analytics');
  return res.json({range:{since:since.toISOString(),until:until.toISOString()},visitsByStage:visits.rows.map(row=>({status:row.status,stage:row.stage,count:row.count})),
    medianStageMinutes:stageTimes.rows.map(row=>({stage:row.stage,medianMinutes:Number(row.median_minutes),sampleSize:row.sample_size})),
    payments:payments.rows.map(row=>({status:row.status,count:row.count,amountKes:Number(row.amount_kes)})),
    appointments:appointments.rows.map(row=>({status:row.status,count:row.count})),visitsByDay:byDay.rows.map(row=>({day:row.day,count:row.visits}))});
});
