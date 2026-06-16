import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { createGoalController } from '../controllers/savings-goals/create-goal.controller';
import { fundGoalController } from '../controllers/savings-goals/fund-goal.controller';
import { getGoalsController } from '../controllers/savings-goals/get-goals.controller';

const router = Router();

router.use(requireAuth);

router.post('/', createGoalController);
router.post('/:id/fund', fundGoalController);
router.get('/', getGoalsController);

export default router;