import { Router } from 'express';
import { getLeaderboard } from '../controllers/leaderboardController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getLeaderboard);

export default router;
