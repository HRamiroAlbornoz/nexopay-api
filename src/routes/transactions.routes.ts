import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { buy } from '../controllers/transactions/buy.controller';
import { sell } from '../controllers/transactions/sell.controller';
import { exchange } from '../controllers/transactions/exchange.controller';
import { transfer } from '../controllers/transactions/transfer.controller';
import { getTransactions } from '../controllers/transactions/get-transactions.controller';

const router = Router();

router.use(requireAuth);

router.post('/buy', buy);
router.post('/sell', sell);
router.post('/exchange', exchange);
router.post('/transfer', transfer);
router.get('/', getTransactions);

export default router;
