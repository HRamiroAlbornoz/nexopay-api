import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { createRateLimiter } from '../middleware/rate-limit';
import { chat } from '../controllers/chatbot/chat.controller';

const router = Router();

// requireAuth corre antes que el limiter, así que req.user ya está disponible:
// se limita por usuario, no por IP, para que usuarios en la misma red no se afecten entre sí.
const chatbotLimiter = createRateLimiter({
  max: 20,
  message: 'Demasiados mensajes al chatbot. Intentá de nuevo en unos minutos.',
  keyGenerator: (req) => req.user!.id,
});

router.post('/', requireAuth, chatbotLimiter, chat);

export default router;
