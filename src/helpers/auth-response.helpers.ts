import { Response } from 'express';
import { User } from '../queries/user.queries';
import { signToken } from './jwt.helpers';
import { COOKIE_NAME, COOKIE_OPTIONS } from '../config/cookie';

export function toPublicUser(user: User): Pick<User, 'id' | 'email' | 'first_name' | 'last_name'> {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

export function respondWithSession(res: Response, user: User, httpStatus: 200 | 201): void {
  const token = signToken({ id: user.id, email: user.email });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.status(httpStatus).json({ user: toPublicUser(user) });
}
