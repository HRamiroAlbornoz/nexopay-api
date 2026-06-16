import { env } from '../env';

export const COOKIE_NAME = 'nexopay_token';

const isProd = env.NODE_ENV === 'production';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  maxAge: 7 * 24 * 60 * 60 * 1000,
} as const;

export const COOKIE_CLEAR_OPTIONS = {
  httpOnly: COOKIE_OPTIONS.httpOnly,
  secure: COOKIE_OPTIONS.secure,
  sameSite: COOKIE_OPTIONS.sameSite,
  path: '/',
} as const;
