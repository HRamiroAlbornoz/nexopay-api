import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { createGoal } from '../controllers/savings-goals/create-goal.controller';
import { fundGoal } from '../controllers/savings-goals/fund-goal.controller';
import { getGoals } from '../controllers/savings-goals/get-goals.controller';

const router = Router();

router.use(requireAuth);

router.post('/', createGoal);
router.get('/', getGoals);
router.post('/:id/fund', fundGoal);

export default router;
