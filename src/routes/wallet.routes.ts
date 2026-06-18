import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { createRateLimiter } from '../middleware/rate-limit';
import { getWallet, getBalances } from '../controllers/wallet/get-wallet.controller';
import { getBalanceHistory } from '../controllers/wallet/get-balance-history.controller';
import { lookupWallet } from '../controllers/wallet/lookup-wallet.controller';

const router = Router();

// requireAuth corre antes que el limiter, así que req.user ya está disponible:
// se limita por usuario, no por IP, para evitar que alguien enumere emails registrados.
const lookupLimiter = createRateLimiter({
  max: 30,
  message: 'Demasiadas búsquedas. Intentá de nuevo en unos minutos.',
  keyGenerator: (req) => req.user!.id,
});

router.get('/', requireAuth, getWallet);
router.get('/balances', requireAuth, getBalances);
router.get('/balance-history', requireAuth, getBalanceHistory);
router.get('/lookup', requireAuth, lookupLimiter, lookupWallet);

export default router;