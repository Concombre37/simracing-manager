import { Router } from 'express';
import { getAllCars, createCar } from '../controllers/carController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getAllCars);
router.post('/', authenticateToken, requireAdmin, createCar);

export default router;
