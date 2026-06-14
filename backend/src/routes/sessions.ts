import { Router } from 'express';
import { getSessions, startSession, stopSession, getSessionResults } from '../controllers/sessionController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getSessions);
router.post('/', authenticateToken, startSession);
router.post('/:id/stop', authenticateToken, stopSession);
router.get('/:id/results', authenticateToken, getSessionResults);

export default router;
