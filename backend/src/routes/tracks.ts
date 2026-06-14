import { Router } from 'express';
import { getAllTracks, createTrack } from '../controllers/trackController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getAllTracks);
router.post('/', authenticateToken, requireAdmin, createTrack);

export default router;
