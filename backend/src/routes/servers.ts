import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { createServer, deleteServer, getAllServers, joinServer, stopServer } from '../controllers/serverController';

const router = Router();

router.get('/', authenticateToken, getAllServers);
router.post('/', authenticateToken, requireRole('admin'), createServer);
router.post('/:id/stop', authenticateToken, requireRole('admin'), stopServer);
router.post('/:id/join', authenticateToken, requireRole('admin', 'technician'), joinServer);
router.delete('/:id', authenticateToken, requireRole('admin'), deleteServer);

export default router;
