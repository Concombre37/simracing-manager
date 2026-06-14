import { Router } from 'express';
import {
  getAllConfigs,
  getConfigById,
  createConfig,
  updateConfig,
  deleteConfig,
  getDefaultConfig,
} from '../controllers/sessionConfigController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getAllConfigs);
router.get('/default', authenticateToken, getDefaultConfig);
router.get('/:id', authenticateToken, getConfigById);
router.post('/', authenticateToken, createConfig);
router.patch('/:id', authenticateToken, updateConfig);
router.delete('/:id', authenticateToken, requireAdmin, deleteConfig);

export default router;
