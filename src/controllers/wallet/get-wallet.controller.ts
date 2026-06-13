import { Request, Response, NextFunction } from 'express';
import { findWalletByUserId, createWallet, getBalancesByWalletId } from '../../queries/wallet.queries';
import { AppError } from '../../middleware/error.middleware';

export const getWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'Usuario no autenticado', 401);
    }
    let wallet = await findWalletByUserId(userId);
    if (!wallet) {
      wallet = await createWallet(userId);
    }
    res.json({ id: wallet.id, created_at: wallet.created_at });
  } catch (error) {
    next(error);
  }
};

export const getBalances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'Usuario no autenticado', 401);
    }
    let wallet = await findWalletByUserId(userId);
    if (!wallet) {
      wallet = await createWallet(userId);
    }
    const balances = await getBalancesByWalletId(wallet.id);
    res.json(balances);
  } catch (error) {
    next(error);
  }
};