import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export interface ClientConnection {
  ws: WebSocket;
  role?: 'admin' | 'customer';
  tableId?: string;
}

const activeConnections = new Set<ClientConnection>();

export function initializeWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    const conn: ClientConnection = { ws };
    activeConnections.add(conn);
    console.log('[WebSocket] Client connected. Active count:', activeConnections.size);

    ws.on('message', (messageStr) => {
      try {
        const message = JSON.parse(messageStr.toString());
        if (message.type === 'register') {
          conn.role = message.role;
          if (message.tableId) {
            conn.tableId = message.tableId;
          }
          console.log(`[WebSocket] Registered: role=${conn.role}, tableId=${conn.tableId}`);
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    });

    ws.on('close', () => {
      activeConnections.delete(conn);
      console.log('[WebSocket] Client disconnected. Active count:', activeConnections.size);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Connection error:', err);
      activeConnections.delete(conn);
    });
  });

  console.log('[WebSocket] Server initialized successfully.');
}

export function broadcastToAdmins(payload: any) {
  const data = JSON.stringify(payload);
  console.log('[WebSocket] Broadcasting to admins:', payload.type);
  for (const conn of activeConnections) {
    if (conn.role === 'admin' && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(data);
    }
  }
}

export function broadcastToTable(tableId: string, payload: any) {
  const data = JSON.stringify(payload);
  console.log(`[WebSocket] Broadcasting to table ${tableId} and admins:`, payload.type);
  for (const conn of activeConnections) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      if ((conn.role === 'customer' && conn.tableId === tableId) || conn.role === 'admin') {
        conn.ws.send(data);
      }
    }
  }
}

export function broadcastToAll(payload: any) {
  const data = JSON.stringify(payload);
  console.log('[WebSocket] Broadcasting to all:', payload.type);
  for (const conn of activeConnections) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(data);
    }
  }
}
