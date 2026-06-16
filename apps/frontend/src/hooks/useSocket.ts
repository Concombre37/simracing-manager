import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket(namespace: string): Socket | null {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = io(`${window.location.origin}${namespace}`, {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [namespace]);

  return socketRef.current;
}
