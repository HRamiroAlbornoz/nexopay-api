import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getExchangeRates } from '../controllers/rates/get-rates.controller';

const router = Router();

router.get('/', requireAuth, getExchangeRates);

export default router;
