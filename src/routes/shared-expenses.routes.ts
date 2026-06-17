import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { createExpense } from '../controllers/shared-expenses/create-expense.controller';
import { settleExpense } from '../controllers/shared-expenses/settle-expense.controller';
import { getExpenses } from '../controllers/shared-expenses/get-expenses.controller';

const router = Router();

router.use(requireAuth);

router.post('/', createExpense);
router.get('/', getExpenses);
router.post('/:id/settle', settleExpense);

export default router;
