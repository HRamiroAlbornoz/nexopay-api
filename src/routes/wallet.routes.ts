import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getWallet, getBalances } from '../controllers/wallet/get-wallet.controller';
import { getBalanceHistory } from '../controllers/wallet/get-balance-history.controller';

const router = Router();

router.get('/', requireAuth, getWallet);
router.get('/balances', requireAuth, getBalances);
router.get('/balance-history', requireAuth, getBalanceHistory);

export default router;