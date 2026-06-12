import { Router } from 'express';
import authRoutes from './auth.routes';
import ratesRoutes from './rates.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/rates', ratesRoutes);

export default router;
