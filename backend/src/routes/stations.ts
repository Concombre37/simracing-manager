import { Router } from 'express';
import { getAllStations, getStationById, updateStation } from '../controllers/stationController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getAllStations);
router.get('/:id', authenticateToken, getStationById);
router.patch('/:id', authenticateToken, updateStation);

export default router;
