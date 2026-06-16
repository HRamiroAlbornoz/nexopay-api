import { Router } from 'express';
import authRoutes from './auth.routes';
import ratesRoutes from './rates.routes';
import transactionsRoutes from './transactions.routes';
import sharedExpensesRoutes from './shared-expenses.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/rates', ratesRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/shared-expense', sharedExpensesRoutes);

export default router;