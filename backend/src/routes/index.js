import { Router } from 'express';
import { authRouter } from './auth.js';
import { patientRouter } from './patient.js';
import { staffRouter } from './staff.js';
import { paymentRouter, mpesaWebhookRouter } from './payments.js';
import { analyticsRouter } from './analytics.js';
import { supportRouter, whatsappWebhookRouter } from './support.js';
import { authenticate } from '../middleware.js';

export const publicApiRouter=Router();
export const protectedApiRouter=Router();
publicApiRouter.use('/auth',authRouter);
publicApiRouter.use(mpesaWebhookRouter,whatsappWebhookRouter);
protectedApiRouter.use(authenticate);
protectedApiRouter.use(patientRouter,staffRouter,paymentRouter,supportRouter,analyticsRouter);
