import { useState, useEffect } from 'react';

class StreamWebSocket {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      try {
        // Validate that the message is proper JSON before notifying listeners
        const data = JSON.parse(event.data);
        this.notifyListeners(data);
      } catch (error) {
        console.error('Invalid WebSocket message format:', event.data);
      }
    };

    this.ws.onclose = () => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectAttempts++;
          this.reconnectDelay *= 2; // Exponential backoff
          this.connect();
        }, this.reconnectDelay);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(data) {
    this.listeners.forEach(callback => callback(data));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
  }
}

const useWebSocket = () => {
  const [lastMessage, setLastMessage] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;
    let isConnecting = false;

    const connect = () => {
      if (isConnecting) return;
      isConnecting = true;

      // Use the same host as the current page, just change the protocol and add /ws path
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log('Connecting to WebSocket:', wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        isConnecting = false;
      };

      ws.onmessage = (event) => {
        try {
          // Validate that the message is proper JSON before setting it
          JSON.parse(event.data);
          setLastMessage(event.data);
        } catch (error) {
          console.error('Invalid WebSocket message format:', event.data);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnecting = false;
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, attempting to reconnect...');
        isConnecting = false;
        // Try to reconnect after 5 seconds
        reconnectTimeout = setTimeout(connect, 5000);
      };

      setSocket(ws);
    };

    connect();

    // Cleanup function
    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []); // Empty dependency array means this effect runs once on mount

  return { lastMessage };
};

// Create a singleton instance
const streamWebSocket = new StreamWebSocket();
export default streamWebSocket;
export { useWebSocket };
