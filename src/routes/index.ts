import { Router } from 'express';
import authRoutes from './auth.routes';
import ratesRoutes from './rates.routes';
import transactionsRoutes from './transactions.routes';
import walletRoutes from './wallet.routes';
import savingsGoalsRoutes from './savings-goals.routes';
import chatbotRoutes from './chatbot.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/rates', ratesRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/wallet', walletRoutes);
router.use('/savings-goals', savingsGoalsRoutes);
router.use('/chatbot', chatbotRoutes);

export default router;