import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findWalletByUserIdOrThrow, getBalancesByWalletId } from '../../queries/wallet.queries';
import { getTransactionsByWalletId } from '../../queries/transaction.queries';
import { getRates } from '../../api-calls/exchange-rates';
import { generateChatReply } from '../../api-calls/gemini';
import { buildSystemPrompt, sanitizeUserMessage, MAX_MESSAGE_LENGTH } from '../../helpers/chatbot.helpers';
import { ChatbotTransactionSummary } from '../../types/chatbot.types';
import { AppError } from '../../middleware/error.middleware';

const RECENT_TRANSACTIONS_LIMIT = 10;

const chatSchema = z.object({
  message: z.string().trim().min(1, 'El mensaje no puede estar vacío').max(MAX_MESSAGE_LENGTH),
});

// Usuarios con un mensaje en proceso — evita que el mismo usuario dispare una
// segunda llamada (paga) a Gemini mientras la primera todavía no respondió.
const usersWithPendingChat = new Set<string>();

export async function chat(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user!.id;

  if (usersWithPendingChat.has(userId)) {
    next(new AppError('CHAT_IN_PROGRESS', 'Ya hay un mensaje en proceso, esperá la respuesta', 429));
    return;
  }

  usersWithPendingChat.add(userId);

  try {
    const parsed = chatSchema.safeParse(req.body);

    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const wallet = await findWalletByUserIdOrThrow(userId);

    // Balances y transacciones son esenciales: si fallan, no hay contexto financiero
    // confiable y el chat debe fallar. Las tasas son un extra — si la API de tasas no
    // responde, el chatbot sigue funcionando sin ellas en vez de romper todo el turno.
    const [balances, transactions] = await Promise.all([
      getBalancesByWalletId(wallet.id),
      getTransactionsByWalletId(wallet.id, RECENT_TRANSACTIONS_LIMIT, 0),
    ]);

    const rates = await getRates().catch((err) => {
      console.error('Chatbot: no se pudieron obtener las tasas de cambio', err);
      return null;
    });

    const recentTransactions: ChatbotTransactionSummary[] = transactions.map((tx) => ({
      type: tx.type,
      currency_from: tx.currency_from,
      currency_to: tx.currency_to,
      amount_from: tx.amount_from,
      amount_to: tx.amount_to,
      exchange_rate: tx.exchange_rate,
      created_at: tx.created_at,
    }));

    const systemPrompt = buildSystemPrompt({ balances, recentTransactions, rates });
    const sanitizedMessage = sanitizeUserMessage(parsed.data.message);

    const reply = await generateChatReply(systemPrompt, sanitizedMessage);

    res.status(200).json({ reply });
  } catch (err) {
    next(err);
  } finally {
    usersWithPendingChat.delete(userId);
  }
}
