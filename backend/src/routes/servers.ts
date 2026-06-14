import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { createServer, deleteServer, getAllServers, stopServer } from '../controllers/serverController';

const router = Router();

router.get('/', authenticateToken, getAllServers);
router.post('/', authenticateToken, requireRole('admin'), createServer);
router.post('/:id/stop', authenticateToken, requireRole('admin'), stopServer);
router.delete('/:id', authenticateToken, requireRole('admin'), deleteServer);

export default router;
