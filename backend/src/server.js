import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { publicApiRouter, protectedApiRouter } from './routes/index.js';

const app=express();
app.disable('x-powered-by');
if(process.env.TRUST_PROXY==='true')app.set('trust proxy',1);
app.use(helmet({crossOriginResourcePolicy:{policy:'same-site'}}));
app.use(cors({origin(origin,callback){if(!origin||config.appOrigins.includes(origin))return callback(null,true);return callback(new Error('Origin not allowed.'));},methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','Idempotency-Key','X-Request-Id'],maxAge:600}));
app.use(express.json({limit:'256kb',verify(req,_res,buffer){req.rawBody=Buffer.from(buffer);}}));
app.use((req,res,next)=>{
  req.id=req.get('x-request-id')?.slice(0,80)??randomUUID();
  res.setHeader('X-Request-Id',req.id);
  if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  const start=process.hrtime.bigint();res.on('finish',()=>console.info(JSON.stringify({requestId:req.id,method:req.method,path:req.path,status:res.statusCode,durationMs:Number(process.hrtime.bigint()-start)/1e6})));
  next();
});
const apiLimiter=rateLimit({windowMs:60_000,limit:240,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'Too many requests. Try again shortly.'}}});
const authLimiter=rateLimit({windowMs:15*60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'AUTH_RATE_LIMIT',message:'Too many sign-in attempts. Try again later.'}}});
app.get('/health/live',(_req,res)=>res.json({status:'ok'}));
app.get('/health/ready',async(_req,res)=>{try{await pool.query('SELECT 1');return res.json({status:'ready',database:'ok'});}catch{return res.status(503).json({status:'not-ready'});}});
app.use('/api/v1/auth',authLimiter);
app.use('/api/v1',apiLimiter,publicApiRouter);
app.use('/api/v1',apiLimiter,protectedApiRouter);
app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Route not found.'}}));
app.use((error,req,res,_next)=>{
  if(res.headersSent)return;
  const status=Number.isInteger(error.status)?error.status:500;
  if(status>=500)console.error(JSON.stringify({requestId:req.id,errorName:error.name,errorCode:error.code??null}));
  return res.status(status).json({error:{code:status>=500?'INTERNAL_ERROR':error.code??'REQUEST_FAILED',message:status>=500?'The request could not be completed.':error.message??'The request could not be completed.'}});
});

const server=app.listen(config.port,async()=>{
  try{await pool.query('SELECT 1');console.info(`MediFlow API listening on port ${config.port} (${config.nodeEnv}).`);}
  catch(error){console.error('Database is unavailable; API is not ready:',error.message);server.close(()=>process.exit(1));}
});
async function shutdown(signal){console.info(`${signal}: closing API server.`);server.close(async()=>{await pool.end();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGINT',()=>void shutdown('SIGINT'));
process.on('SIGTERM',()=>void shutdown('SIGTERM'));
