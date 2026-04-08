import WebSocket, { WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';
import { Trade, Market, Order, WSMessage } from '../types';

/**
 * WebSocket server for real-time market data.
 *
 * Supports two modes:
 * - Standalone: opens its own port (local dev)
 * - Attached: shares the HTTP server port via upgrade (production/Railway)
 */
export class MarketWebSocketServer {
  private wss: WebSocketServer;
  private subscriptions: Map<string, Set<WebSocket>> = new Map();

  /**
   * Standalone mode — opens WebSocket on its own port (local dev)
   */
  constructor(port: number);
  /**
   * Attached mode — shares port with HTTP server (production)
   */
  constructor(httpServer: HttpServer);
  constructor(portOrServer: number | HttpServer) {
    if (typeof portOrServer === 'number') {
      this.wss = new WebSocketServer({ port: portOrServer });
      console.log(`WebSocket server listening on port ${portOrServer}`);
    } else {
      this.wss = new WebSocketServer({ server: portOrServer });
      console.log('WebSocket server attached to HTTP server');
    }
    this.setupConnections();
  }

  /**
   * Setup connection handlers
   */
  private setupConnections(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleSubscription(ws, message);
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              data: { message: 'Invalid message format' },
              timestamp: new Date(),
            })
          );
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.unsubscribeAll(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  private handleSubscription(ws: WebSocket, message: any): void {
    const { action, channel } = message;

    if (action === 'subscribe') {
      this.subscribe(ws, channel);
      ws.send(
        JSON.stringify({
          type: 'subscription',
          channel,
          status: 'subscribed',
          timestamp: new Date(),
        })
      );
    } else if (action === 'unsubscribe') {
      this.unsubscribe(ws, channel);
      ws.send(
        JSON.stringify({
          type: 'subscription',
          channel,
          status: 'unsubscribed',
          timestamp: new Date(),
        })
      );
    }
  }

  private subscribe(ws: WebSocket, channel: string): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(ws);
  }

  private unsubscribe(ws: WebSocket, channel: string): void {
    const subscribers = this.subscriptions.get(channel);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.subscriptions.delete(channel);
      }
    }
  }

  private unsubscribeAll(ws: WebSocket): void {
    for (const [channel, subscribers] of this.subscriptions.entries()) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.subscriptions.delete(channel);
      }
    }
  }

  public broadcastOrderBookUpdate(marketId: string, outcomeIndex: number, data: any): void {
    const channel = `orderbook:${marketId}:${outcomeIndex}`;
    this.broadcast(channel, { type: 'orderbook_update', channel, data, timestamp: new Date() });
  }

  public broadcastTrade(trade: Trade): void {
    const channel = `trades:${trade.marketId}`;
    this.broadcast(channel, { type: 'trade', channel, data: trade, timestamp: new Date() });
  }

  public broadcastMarketUpdate(market: Market): void {
    const channel = 'markets';
    this.broadcast(channel, { type: 'market_update', channel, data: market, timestamp: new Date() });
  }

  public broadcastOrderUpdate(order: Order): void {
    const channel = `orders:${order.marketId}:${order.userId}`;
    this.broadcast(channel, { type: 'order_update', channel, data: order, timestamp: new Date() });
  }

  private broadcast(channel: string, message: WSMessage): void {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    const payload = JSON.stringify(message);
    for (const client of subscribers) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  public getStats(): { totalConnections: number; channels: Array<{ channel: string; subscribers: number }> } {
    let totalConnections = new Set<WebSocket>();
    const channels: Array<{ channel: string; subscribers: number }> = [];

    for (const [channel, subscribers] of this.subscriptions.entries()) {
      subscribers.forEach((ws) => totalConnections.add(ws));
      channels.push({ channel, subscribers: subscribers.size });
    }

    return { totalConnections: totalConnections.size, channels };
  }

  public close(): void {
    this.wss.close();
  }
}
