import { Router } from 'express';
import { getAllStations, getStationById, updateStation } from '../controllers/stationController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { getIO } from '../services/socketService';

const router = Router();

router.get('/', authenticateToken, getAllStations);
router.get('/:id', authenticateToken, getStationById);
router.patch('/:id', authenticateToken, updateStation);

router.post('/:id/update-agent', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const io = getIO();
    const roomName = `station:${req.params.id}`;
    const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    if (roomSize === 0) {
      return res.status(503).json({ error: 'Agent non connecté' });
    }
    io.to(roomName).emit('agent:update');
    return res.json({ message: 'Commande de mise à jour envoyée à l\'agent' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
