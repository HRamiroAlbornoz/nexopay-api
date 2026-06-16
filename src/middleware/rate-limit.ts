import { Request } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;

interface RateLimiterOptions {
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
}

export function createRateLimiter({ max, message, keyGenerator }: RateLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    max,
    keyGenerator,
    message: {
      code: 'TOO_MANY_REQUESTS',
      message,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}
