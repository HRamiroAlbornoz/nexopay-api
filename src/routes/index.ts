import { Router } from 'express';
import authRoutes from './auth.routes';
import ratesRoutes from './rates.routes';
import transactionsRoutes from './transactions.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/rates', ratesRoutes);
router.use('/transactions', transactionsRoutes);

export default router;
