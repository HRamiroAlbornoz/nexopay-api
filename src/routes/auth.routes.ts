import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register } from '../controllers/auth/register.controller';
import { login } from '../controllers/auth/login.controller';
import { logout } from '../controllers/auth/logout.controller';
import { me } from '../controllers/auth/me.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Demasiados intentos. Intentá de nuevo en 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

export default router;
