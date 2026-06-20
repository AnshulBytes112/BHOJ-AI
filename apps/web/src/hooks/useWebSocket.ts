'use client';

import { useEffect, useRef } from 'react';

interface UseWebSocketProps {
  tableId: string;
  onKotStatusUpdate: () => void;
  onBillStatusUpdate: (status: string) => void;
}

export function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      const url = new URL(apiUrl);
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${url.host}/`;
    } catch (e) {
      console.error('Failed to parse NEXT_PUBLIC_API_URL for WebSocket URL generation:', e);
    }
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname.startsWith('192.168.') ||
                    window.location.hostname.startsWith('10.') ||
                    window.location.hostname.startsWith('172.');
    const port = isLocal ? ':3333' : (window.location.port ? `:${window.location.port}` : '');
    return `${protocol}//${window.location.hostname}${port}/`;
  }

  return 'ws://localhost:3333/';
}

export function useWebSocket({ tableId, onKotStatusUpdate, onBillStatusUpdate }: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  
  const onKotRef = useRef(onKotStatusUpdate);
  const onBillRef = useRef(onBillStatusUpdate);

  useEffect(() => {
    onKotRef.current = onKotStatusUpdate;
    onBillRef.current = onBillStatusUpdate;
  }, [onKotStatusUpdate, onBillStatusUpdate]);

  useEffect(() => {
    if (!tableId) return;

    function connectWs() {
      const wsUrl = getWebSocketUrl();
      console.log(`[WS Customer] Connecting to ${wsUrl}...`);
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[WS Customer] Connected to WS server');
        socket.send(JSON.stringify({
          type: 'register',
          role: 'customer',
          tableId
        }));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WS Customer] Message received:', message);

          if (message.type === 'KOT_STATUS_UPDATED') {
            onKotRef.current();
          } else if (message.type === 'BILL_STATUS_UPDATED') {
            onBillRef.current(message.status);
          }
        } catch (err) {
          console.error('[WS Customer] Error parsing message:', err);
        }
      };

      socket.onclose = () => {
        console.log('[WS Customer] Disconnected, reconnecting in 5s...');
        setTimeout(connectWs, 5000);
      };

      socket.onerror = (err) => {
        console.error(`[WS Customer] Socket error on URL: ${wsUrl}. (Note: browsers hide connection details from WebSocket error events for security)`, err);
        socket.close();
      };
    }

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [tableId]); // Only reconnect if tableId changes

  return wsRef.current;
}
