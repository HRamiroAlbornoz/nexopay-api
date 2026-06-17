import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import {
  findUserByGoogleSub,
  findUserByEmail,
  linkGoogleSubToUser,
  createUserWithWallet,
  User,
} from '../../queries/user.queries';
import { signToken } from '../../helpers/jwt.helpers';
import { AppError } from '../../middleware/error.middleware';
import { COOKIE_NAME, COOKIE_OPTIONS } from '../../config/cookie';
import { env } from '../../env';

const googleAuthSchema = z.object({
  credential: z.string().min(1, 'El token de Google es requerido'),
});

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function toPublicUser(user: User): Pick<User, 'id' | 'email' | 'first_name' | 'last_name'> {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

function buildFirstName(payload: TokenPayload, email: string): string {
  if (payload.given_name) {
    return payload.given_name;
  }
  if (payload.name) {
    return payload.name.split(' ')[0];
  }
  return email.split('@')[0];
}

interface VerifiedGooglePayload extends TokenPayload {
  sub: string;
  email: string;
}

async function verifyGoogleToken(credential: string): Promise<VerifiedGooglePayload> {
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
  } catch {
    throw new AppError('INVALID_GOOGLE_TOKEN', 'El token de Google no es válido', 401);
  }

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new AppError('INVALID_GOOGLE_TOKEN', 'El token de Google no es válido', 401);
  }

  return payload as VerifiedGooglePayload;
}

function respondWithSession(res: Response, user: User, httpStatus: 200 | 201): void {
  const token = signToken({ id: user.id, email: user.email });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.status(httpStatus).json({ user: toPublicUser(user) });
}

export async function googleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = googleAuthSchema.safeParse(req.body);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const payload = await verifyGoogleToken(parsed.data.credential);
    const googleSub = payload.sub;
    const email = payload.email.toLowerCase();

    const existingByGoogleSub = await findUserByGoogleSub(googleSub);
    if (existingByGoogleSub) {
      respondWithSession(res, existingByGoogleSub, 200);
      return;
    }

    const existingByEmail = await findUserByEmail(email);
    if (existingByEmail) {
      if (!payload.email_verified) {
        throw new AppError('GOOGLE_EMAIL_NOT_VERIFIED', 'El email de esta cuenta de Google no está verificado', 403);
      }

      const linkedUser = await linkGoogleSubToUser(existingByEmail.id, googleSub);
      if (!linkedUser) {
        throw new AppError('USER_NOT_FOUND', 'El usuario ya no existe', 404);
      }
      respondWithSession(res, linkedUser, 200);
      return;
    }

    const { user } = await createUserWithWallet({
      email,
      password_hash: null,
      first_name: buildFirstName(payload, email),
      last_name: payload.family_name ?? null,
      google_sub: googleSub,
    });

    respondWithSession(res, user, 201);
  } catch (err) {
    next(err);
  }
}
