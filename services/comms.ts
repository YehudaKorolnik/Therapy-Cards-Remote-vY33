import { Action, SessionState, Role } from '../types';

declare const Peer: any;

export class CommsManager {
  private peer: any;
  private connections: any[] = []; // For Host: list of client connections
  private hostConnection: any = null; // For Client: connection to host
  private role: string;
  private sessionId: string;
  private isHost: boolean;
  private onAction?: (action: Action) => void;
  private onState?: (state: SessionState) => void;
  private onConnect?: () => void; // New callback
  private retryTimer: any = null;
  private lastState: SessionState | null = null; // Cache last state for new connections

  constructor(
    role: string,
    sessionId: string,
    onAction?: (action: Action) => void,
    onState?: (state: SessionState) => void,
    onConnect?: () => void
  ) {
    this.role = role;
    this.sessionId = sessionId;
    this.isHost = role === Role.THERAPIST;
    this.onAction = onAction;
    this.onState = onState;
    this.onConnect = onConnect;

    this.initializePeer();
  }

  private initializePeer() {
    // Prefix ID to ensure safe namespace on public PeerJS server
    const peerId = this.isHost ? `lumina-session-${this.sessionId}` : undefined;

    // cleanup old instances if they exist globally (rare edge case)
    if (this.peer) this.peer.destroy();

    this.peer = new Peer(peerId, {
      debug: 1
    });

    this.peer.on('open', (id: string) => {
      console.log(`[${this.role}] Peer opened: ${id}`);
      if (!this.isHost) {
        this.connectToHost();
      } else {
        if (this.onConnect) this.onConnect();
      }
    });

    this.peer.on('connection', (conn: any) => {
      if (this.isHost) {
        this.handleIncomingConnection(conn);
      } else {
        conn.on('data', (data: any) => this.handleData(data));
      }
    });

    this.peer.on('error', (err: any) => {
      console.error(`[${this.role}] Peer error:`, err);
      if (!this.isHost && (err.type === 'peer-unavailable' || err.type === 'network')) {
         // Retry connection if host is not ready yet
         if (this.retryTimer) clearTimeout(this.retryTimer);
         this.retryTimer = setTimeout(() => this.connectToHost(), 2000);
      }
    });
  }

  private connectToHost() {
    const hostId = `lumina-session-${this.sessionId}`;
    console.log(`[${this.role}] Connecting to host: ${hostId}`);
    
    if (this.hostConnection) {
        this.hostConnection.close();
    }

    const conn = this.peer.connect(hostId, {
      reliable: true
    });

    conn.on('open', () => {
      console.log(`[${this.role}] Connected to host`);
      this.hostConnection = conn;
      
      // CRITICAL: Notify the App that the pipe is open so it can send JOIN immediately
      if (this.onConnect) {
        this.onConnect();
      }
    });

    conn.on('data', (data: any) => this.handleData(data));
    
    conn.on('close', () => {
      console.log(`[${this.role}] Connection closed`);
      this.hostConnection = null;
      // Retry logic could go here
    });
    
    conn.on('error', (err: any) => {
       console.error(`[${this.role}] Connection error:`, err);
    });
  }

  private handleIncomingConnection(conn: any) {
    console.log(`[HOST] Incoming connection from ${conn.peer}`);
    this.connections.push(conn);
    
    // CRITICAL: Immediately send the current state to the new connection
    // This prevents the "Blank Screen" issue if the Client's JOIN packet gets lost
    if (this.lastState) {
        console.log(`[HOST] Sending cached state to new peer ${conn.peer}`);
        conn.send(this.lastState);
    }

    conn.on('data', (data: any) => {
      this.handleData(data);
    });

    conn.on('close', () => {
      this.connections = this.connections.filter(c => c !== conn);
    });
  }

  private handleData(data: any) {
    if (data.type && data.sender) {
      // It's an Action
      if (this.onAction) this.onAction(data as Action);
    } else if (data.sessionId) {
      // It's State (heuristic: has sessionId)
      if (this.onState) this.onState(data as SessionState);
    }
  }

  public sendAction(action: Action) {
    if (this.isHost) {
        // Host doesn't send actions to itself via comms, handled in hook.
    } else {
      if (this.hostConnection && this.hostConnection.open) {
        this.hostConnection.send(action);
      } else {
         console.warn(`[${this.role}] Cannot send action, disconnected.`);
      }
    }
  }

  public broadcastState(state: SessionState) {
    if (this.isHost) {
      // Cache state for new connections
      this.lastState = state;
      
      this.connections.forEach(conn => {
        if (conn.open) {
          conn.send(state);
        }
      });
    }
  }

  public cleanup() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.peer) this.peer.destroy();
  }
}