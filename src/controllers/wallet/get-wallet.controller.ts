import { Request, Response, NextFunction } from 'express';
import { findWalletByUserIdOrThrow, getBalancesByWalletId } from '../../queries/wallet.queries';

export const getWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallet = await findWalletByUserIdOrThrow(req.user!.id);
    res.json({ id: wallet.id, created_at: wallet.created_at });
  } catch (error) {
    next(error);
  }
};

export const getBalances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallet = await findWalletByUserIdOrThrow(req.user!.id);
    const balances = await getBalancesByWalletId(wallet.id);
    res.json(balances);
  } catch (error) {
    next(error);
  }
};
