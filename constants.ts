import { Card, SessionState, Mode, Role, SessionType } from './types';

export const INITIAL_DECK: Card[] = [];

export const INITIAL_STATE: SessionState = {
  sessionId: 'DEMO-123',
  sessionType: SessionType.SINGLE, // Changed default to SINGLE
  status: 'WAITING',
  mode: Mode.DECK,
  clients: {
    [Role.CLIENT_A]: { id: 'client-a', role: Role.CLIENT_A, name: 'Client A', isConnected: false, currentCardIndex: 0, tray: [], laser: null, laserMode: false, cardRotations: {} },
    [Role.CLIENT_B]: { id: 'client-b', role: Role.CLIENT_B, name: 'Client B', isConnected: false, currentCardIndex: 0, tray: [], laser: null, laserMode: false, cardRotations: {} },
    [Role.THERAPIST]: { id: 'therapist', role: Role.THERAPIST, name: 'Therapist', isConnected: true, currentCardIndex: 0, tray: [], laser: null, laserMode: false, cardRotations: {} },
  },
  deck: INITIAL_DECK,
  deckOrders: {
    [Role.CLIENT_A]: [],
    [Role.CLIENT_B]: [],
  },
  whiteboard: {
    items: [],
    locked: true,
  },
  lastUpdate: Date.now(),
};