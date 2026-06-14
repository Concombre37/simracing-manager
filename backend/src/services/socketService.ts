import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setIO(instance: SocketIOServer) {
  io = instance;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO non initialisé');
  }
  return io;
}
