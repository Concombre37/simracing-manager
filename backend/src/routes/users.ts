import { Router } from 'express';
import { getAllUsers, getUserById, updateUserRole } from '../controllers/userController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getAllUsers);
router.get('/:id', authenticateToken, getUserById);
router.patch('/:id/role', authenticateToken, requireAdmin, updateUserRole);

export default router;
