import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getWallet, getBalances } from '../controllers/wallet/get-wallet.controller';

const router = Router();

router.get('/', requireAuth, getWallet);
router.get('/balances', requireAuth, getBalances);

export default router;