type MessageHandler = (data: unknown) => void

interface Subscription {
  channel: string
  handler: MessageHandler
}

export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private subscriptions: Map<string, MessageHandler> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private messageQueue: string[] = []
  private isConnecting = false

  constructor(url: string = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001') {
    this.url = url
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('Connection already in progress'))
        return
      }

      this.isConnecting = true

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.reconnectAttempts = 0
          this.isConnecting = false

          // Flush message queue
          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift()
            if (msg && this.ws) {
              this.ws.send(msg)
            }
          }

          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            const { channel, data } = message

            if (channel && this.subscriptions.has(channel)) {
              const handler = this.subscriptions.get(channel)
              if (handler) {
                handler(data)
              }
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        this.ws.onclose = () => {
          console.log('WebSocket disconnected')
          this.isConnecting = false
          this.attemptReconnect()
        }

        this.ws.onerror = (event) => {
          console.error('WebSocket error:', event)
          this.isConnecting = false
          reject(new Error('WebSocket connection failed'))
        }
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      console.log(`Attempting to reconnect in ${delay}ms...`)

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error)
        })
      }, delay)
    }
  }

  subscribe(channel: string, handler: MessageHandler): void {
    this.subscriptions.set(channel, handler)

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'subscribe',
        channel,
      })
    }
  }

  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel)

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'unsubscribe',
        channel,
      })
    }
  }

  private send(message: unknown): void {
    const data = JSON.stringify(message)

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      this.messageQueue.push(data)
    }
  }

  disconnect(): void {
    this.subscriptions.clear()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient()
  }
  return wsClient
}
