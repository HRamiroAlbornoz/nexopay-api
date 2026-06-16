import { Router } from 'express';
import { register } from '../controllers/auth/register.controller';
import { login } from '../controllers/auth/login.controller';
import { logout } from '../controllers/auth/logout.controller';
import { me } from '../controllers/auth/me.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { createRateLimiter } from '../middleware/rate-limit';

const router = Router();

const authLimiter = createRateLimiter({
  max: 10,
  message: 'Demasiados intentos. Intentá de nuevo en 15 minutos.',
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

export default router;
