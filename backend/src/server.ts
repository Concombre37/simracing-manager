import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { env } from './config/env';
import { setupAgentSocket } from './sockets/agentSocket';
import { setIO } from './services/socketService';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import stationRoutes from './routes/stations';
import carRoutes from './routes/cars';
import trackRoutes from './routes/tracks';
import sessionConfigRoutes from './routes/sessionConfigs';
import sessionRoutes from './routes/sessions';
import leaderboardRoutes from './routes/leaderboard';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/session-configs', sessionConfigRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    }
  });
}

setIO(io);
setupAgentSocket(io);

const PORT = env.PORT;
httpServer.listen(PORT, () => {
  console.log(`Serveur Sim Center démarré sur le port ${PORT}`);
});
