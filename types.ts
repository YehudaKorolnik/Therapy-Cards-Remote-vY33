
export enum Role {
  THERAPIST = 'THERAPIST',
  CLIENT_A = 'CLIENT_A',
  CLIENT_B = 'CLIENT_B',
  OBSERVER = 'OBSERVER' // For desktop whiteboard view
}

export enum Mode {
  DECK = 'DECK',
  WHITEBOARD = 'WHITEBOARD'
}

export enum SessionType {
  SINGLE = 'SINGLE',
  COUPLE = 'COUPLE'
}

export interface Card {
  id: string;
  imageUrl: string;
  title: string;
  rotation: number; // 0, 90, 180, 270 (Base rotation)
}

export interface WhiteboardItem {
  id: string;
  type: 'CARD' | 'IMAGE';
  content: string; // URL or ID
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ClientState {
  id: string;
  role: Role;
  name: string;
  isConnected: boolean;
  currentCardIndex: number;
  tray: string[]; // Array of Card IDs
  laser: { x: number; y: number; active: boolean } | null;
  laserMode: boolean; // Toggle for laser tool
  cardRotations: Record<string, number>; // Map of Card ID -> Rotation (0, 90, 180, 270)
}

export interface SessionState {
  sessionId: string;
  sessionType: SessionType;
  status: 'WAITING' | 'ACTIVE';
  mode: Mode;
  clients: Record<string, ClientState>; // Keyed by Role
  deck: Card[];
  deckOrders: Record<string, string[]>; // Keyed by Role, contains array of Card IDs
  whiteboard: {
    items: WhiteboardItem[];
    locked: boolean;
  };
  lastUpdate: number;
}

export type ActionType = 
  | 'JOIN' 
  | 'START_SESSION' 
  | 'RESET'
  | 'SET_MODE' 
  | 'NEXT_CARD' 
  | 'PREV_CARD' 
  | 'JUMP_TO_CARD' 
  | 'CLIENT_ROTATE'   // Sync client rotation
  | 'ROTATE_CARD'     // Base card rotation (if needed)
  | 'ADD_TO_TRAY' 
  | 'REMOVE_FROM_TRAY'
  | 'UPDATE_LASER'
  | 'TOGGLE_LASER_MODE' 
  | 'IMPORT_TRAY' 
  | 'ADD_WB_ITEM'     
  | 'MOVE_WB_ITEM'
  | 'ROTATE_WB_ITEM'  
  | 'DELETE_WB_ITEM'  
  | 'SYNC_REQ'
  | 'UPDATE_SETTINGS'
  | 'UPLOAD_DECK'
  | 'DELETE_CARD'
  | 'CLEAR_DECK'
  | 'TOGGLE_LOCK'; 

export interface Action {
  type: ActionType;
  payload?: any;
  sender: Role;
}