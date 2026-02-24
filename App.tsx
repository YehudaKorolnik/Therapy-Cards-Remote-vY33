import React, { useState, useEffect, useRef, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { INITIAL_STATE } from './constants';
import { CommsManager } from './services/comms';
import { Action, Role, SessionState, Mode, WhiteboardItem, SessionType } from './types';
import { TherapistDashboard } from './components/TherapistDashboard';
import { ClientView } from './components/ClientView';
import { Button } from './components/Button';

// --- REDUCER ---
function sessionReducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'JOIN':
      const clientRole = action.sender as string;
      const { name } = action.payload || {};
      if (state.clients[clientRole]) {
        return {
          ...state,
          clients: {
            ...state.clients,
            [clientRole]: { 
              ...state.clients[clientRole], 
              isConnected: true,
              name: name || state.clients[clientRole].name 
            }
          }
        };
      }
      return state;

    case 'START_SESSION':
      // Randomize Deck Order SEPARATELY for each client
      const allCardIds = state.deck.map(c => c.id);
      
      const shuffle = (array: string[]) => [...array].sort(() => Math.random() - 0.5);
      
      const deckOrderA = shuffle(allCardIds);
      const deckOrderB = shuffle(allCardIds);
      
      // Also randomize base rotation for the deck items themselves (optional, affects global deck state)
      const shuffledDeck = state.deck.map(card => ({
          ...card,
          rotation: ([0, 90, 180, 270][Math.floor(Math.random() * 4)])
      }));
        
      return { 
        ...state, 
        status: 'ACTIVE',
        deck: shuffledDeck,
        deckOrders: {
           [Role.CLIENT_A]: deckOrderA,
           [Role.CLIENT_B]: deckOrderB
        },
        // Reset client indices and rotation maps on start, BUT PRESERVE CONNECTION STATUS
        clients: {
          ...state.clients,
          [Role.CLIENT_A]: { 
            ...state.clients[Role.CLIENT_A], 
            currentCardIndex: 0, 
            cardRotations: {} 
            // isConnected is inherited from spread
          },
          [Role.CLIENT_B]: { 
            ...state.clients[Role.CLIENT_B], 
            currentCardIndex: 0, 
            cardRotations: {} 
            // isConnected is inherited from spread
          },
        }
      };

    case 'RESET':
      return { ...INITIAL_STATE, sessionId: state.sessionId, sessionType: state.sessionType }; 

    case 'SET_MODE':
      return { ...state, mode: action.payload };

    case 'TOGGLE_LOCK':
      return { 
        ...state, 
        whiteboard: {
          ...state.whiteboard,
          locked: !state.whiteboard.locked
        }
      };

    case 'UPDATE_SETTINGS':
      const { sessionType, names } = action.payload;
      let updatedClients = { ...state.clients };
      
      if (names) {
        Object.keys(names).forEach(key => {
          if (updatedClients[key]) {
            updatedClients[key] = { ...updatedClients[key], name: names[key] };
          }
        });
      }

      if (state.status === 'ACTIVE' && sessionType) {
        return { ...state, clients: updatedClients };
      }

      return { 
        ...state, 
        sessionType: sessionType || state.sessionType,
        clients: updatedClients
      };

    case 'UPLOAD_DECK':
      // When uploading new cards, append them to the deck.
      const newDeck = [...state.deck, ...action.payload];
      // We should add these new IDs to the end of existing orders so clients can see them
      const newIds = action.payload.map((c: any) => c.id);
      return { 
         ...state, 
         deck: newDeck,
         deckOrders: {
            [Role.CLIENT_A]: [...(state.deckOrders[Role.CLIENT_A] || []), ...newIds],
            [Role.CLIENT_B]: [...(state.deckOrders[Role.CLIENT_B] || []), ...newIds],
         }
      };
    
    case 'CLEAR_DECK':
      return { ...state, deck: [], deckOrders: { [Role.CLIENT_A]: [], [Role.CLIENT_B]: [] } };

    case 'DELETE_CARD':
      const filteredDeck = state.deck.filter(c => c.id !== action.payload.id);
      return { 
         ...state, 
         deck: filteredDeck,
         deckOrders: {
            [Role.CLIENT_A]: (state.deckOrders[Role.CLIENT_A] || []).filter(id => id !== action.payload.id),
            [Role.CLIENT_B]: (state.deckOrders[Role.CLIENT_B] || []).filter(id => id !== action.payload.id),
         }
      };

    case 'CLIENT_ROTATE':
      {
        const { cardId, rotation } = action.payload;
        const client = state.clients[action.sender as string];
        if (!client) return state;
        
        return {
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { 
              ...client, 
              cardRotations: {
                ...client.cardRotations,
                [cardId]: rotation
              }
            }
          }
        };
      }

    case 'NEXT_CARD':
      {
        const client = state.clients[action.sender as string];
        if (!client) return state;
        const order = state.deckOrders[action.sender] || [];
        const newIndex = Math.min(order.length - 1, client.currentCardIndex + 1);
        return {
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { ...client, currentCardIndex: newIndex } // Rotation preserved in cardRotations map
          }
        };
      }

    case 'PREV_CARD':
      {
        const client = state.clients[action.sender as string];
        if (!client) return state;
        const newIndex = Math.max(0, client.currentCardIndex - 1);
        return {
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { ...client, currentCardIndex: newIndex } // Rotation preserved
          }
        };
      }

    case 'JUMP_TO_CARD':
      {
        const { targetRole, cardId, cardIndex } = action.payload;
        const roleToUpdate = targetRole || action.sender;
        if (!state.clients[roleToUpdate]) return state;

        const order = state.deckOrders[roleToUpdate] || [];
        
        let index = -1;
        if (typeof cardIndex === 'number') {
          index = cardIndex;
        } else {
          index = order.findIndex(id => id === cardId);
        }
        
        if (index === -1) return state;

        return {
          ...state,
          clients: {
            ...state.clients,
            [roleToUpdate]: { ...state.clients[roleToUpdate], currentCardIndex: index } // Rotation preserved
          }
        };
      }

    case 'ADD_TO_TRAY':
      {
        const client = state.clients[action.sender as string];
        const order = state.deckOrders[action.sender] || [];
        const cardId = order[client.currentCardIndex];
        
        if (!cardId) return state;

        let newTray = client.tray;
        if (!newTray.includes(cardId)) {
           newTray = [...newTray, cardId];
        }

        // Auto-advance to next card after adding to tray
        const nextIndex = Math.min(order.length - 1, client.currentCardIndex + 1);

        return {
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { ...client, tray: newTray, currentCardIndex: nextIndex }
          }
        };
      }

    case 'REMOVE_FROM_TRAY':
      {
        const client = state.clients[action.sender as string];
        const order = state.deckOrders[action.sender] || [];
        const cardId = order[client.currentCardIndex];
        return {
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { ...client, tray: client.tray.filter(id => id !== cardId) }
          }
        };
      }

    case 'UPDATE_LASER':
      return {
        ...state,
        clients: {
          ...state.clients,
          [action.sender]: { ...state.clients[action.sender], laser: action.payload }
        }
      };

    case 'TOGGLE_LASER_MODE':
      return {
        ...state,
        clients: {
          ...state.clients,
          [action.sender]: { ...state.clients[action.sender], laserMode: !state.clients[action.sender].laserMode }
        }
      };

    case 'IMPORT_TRAY':
      {
         const sourceRole = action.payload.sourceRole;
         const client = state.clients[sourceRole];
         const trayCards = client.tray.map(id => state.deck.find(c => c.id === id)).filter(c => !!c);
         
         const cols = 3;
         const startX = 1000 - (cols * 220) / 2;
         const startY = 1000 - (Math.ceil(trayCards.length / cols) * 320) / 2;

         const newItems: WhiteboardItem[] = trayCards.map((card, i) => {
            if (!card) return null as any;
            // Look up client-specific rotation for this card
            const clientRotation = client.cardRotations[card.id] || 0;
            const col = i % cols;
            const row = Math.floor(i / cols);
            
            return {
              id: `wb-${Date.now()}-${i}-${Math.random().toString(36).substr(2,5)}`,
              type: 'CARD',
              content: card.imageUrl,
              x: startX + (col * 220),
              y: startY + (row * 320),
              width: 200,
              height: 300,
              rotation: (card.rotation + clientRotation) % 360 // Combine base rotation + client rotation
            }
         });

         return {
           ...state,
           mode: Mode.WHITEBOARD,
           whiteboard: {
             ...state.whiteboard,
             items: [...state.whiteboard.items, ...newItems]
           }
         };
      }

    case 'ADD_WB_ITEM':
      {
         const { x, y, content, type, width, height } = action.payload;
         const newItem: WhiteboardItem = {
            id: `wb-drop-${Date.now()}-${Math.random()}`,
            type: type || 'CARD',
            content,
            x: x - (width/2),
            y: y - (height/2),
            width: width || 200,
            height: height || 300,
            rotation: 0
         };
         return {
            ...state,
            whiteboard: {
              ...state.whiteboard,
              items: [...state.whiteboard.items, newItem]
            }
         }
      }

    case 'MOVE_WB_ITEM':
      {
        const { id, x, y } = action.payload;
        return {
          ...state,
          whiteboard: {
            ...state.whiteboard,
            items: state.whiteboard.items.map(item => 
              item.id === id ? { ...item, x, y } : item
            )
          }
        };
      }
    
    case 'ROTATE_WB_ITEM':
      {
        const { id } = action.payload;
        return {
           ...state,
           whiteboard: {
             ...state.whiteboard,
             items: state.whiteboard.items.map(item => 
               item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item
             )
           }
        };
      }

    case 'DELETE_WB_ITEM':
      {
        const { id } = action.payload;
        return {
           ...state,
           whiteboard: {
             ...state.whiteboard,
             items: state.whiteboard.items.filter(item => item.id !== id)
           }
        };
      }

    default:
      return state;
  }
}

// --- HOOKS FOR LOGIC ---

const useHostSession = () => {
  // Initialize state with persisted Session ID if available
  const [state, setState] = useState<SessionState>(() => {
    const savedId = sessionStorage.getItem('lumina_host_id');
    const sessionId = savedId || Math.random().toString(36).substring(2, 8).toUpperCase();
    if (!savedId) sessionStorage.setItem('lumina_host_id', sessionId);
    
    return { ...INITIAL_STATE, sessionId };
  });

  const stateRef = useRef(state);
  const comms = useRef<CommsManager | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // Pass sessionId to CommsManager so it can register as a Peer with a specific ID
    comms.current = new CommsManager(
      Role.THERAPIST,
      stateRef.current.sessionId,
      (action) => {
        const newState = sessionReducer(stateRef.current, action);
        stateRef.current = newState;
        setState(newState);
        comms.current?.broadcastState(newState);
      },
      undefined,
      // On Connect (Host) - no specific action needed immediately besides logging
      () => console.log("Host Peer Ready") 
    );
    // Initial broadcast after delay just in case
    setTimeout(() => comms.current?.broadcastState(stateRef.current), 500);
    return () => comms.current?.cleanup();
  }, []); // Only run once on mount

  const sendAction = (action: Action) => {
    const newState = sessionReducer(stateRef.current, action);
    stateRef.current = newState;
    setState(newState);
    comms.current?.broadcastState(newState);
  };

  return { state, sendAction };
};

const useClientSession = (role: Role, initialName?: string, sessionId?: string) => {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const comms = useRef<CommsManager | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    comms.current = new CommsManager(
      role,
      sessionId,
      undefined,
      (newState) => {
        setState(newState);
      },
      // onConnect Callback: Fires exactly when PeerJS connection opens
      () => {
        console.log(`[${role}] Connection open! Sending JOIN.`);
        comms.current?.sendAction({ type: 'JOIN', sender: role, payload: { name: initialName } });
      }
    );

    return () => comms.current?.cleanup();
  }, [role, initialName, sessionId]);

  // Keep the "sticky" connection logic as a backup for network hiccups
  useEffect(() => {
    if (state.clients[role] && !state.clients[role].isConnected && sessionId && comms.current) {
       const timer = setTimeout(() => {
          console.log(`[${role}] Detected disconnection, attempting re-join...`);
          // Only send if we think we might be connected but state says otherwise
          comms.current?.sendAction({ type: 'JOIN', sender: role, payload: { name: initialName } });
       }, 3000);
       return () => clearTimeout(timer);
    }
  }, [state.clients[role]?.isConnected, role, initialName, sessionId]);

  const sendAction = (action: Action) => {
    comms.current?.sendAction(action);
  };

  return { state, sendAction };
};


// --- COMPONENTS ---

const SystemTestView: React.FC = () => {
  const host = useHostSession();
  const clientA = useClientSession(Role.CLIENT_A, "Client A (Test)", host.state.sessionId);
  const clientB = useClientSession(Role.CLIENT_B, "Client B (Test)", host.state.sessionId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-900">
      {/* Left: Host (50% width) */}
      <div className="w-1/2 border-r border-gray-700 h-full">
        <TherapistDashboard state={host.state} sendAction={host.sendAction} />
      </div>

      {/* Right: Clients (50% width, stacked vertically) */}
      <div className="w-1/2 flex flex-col h-full">
        
        {/* Client A View */}
        <div className={`relative w-full border-b border-gray-700 bg-gray-50 ${host.state.sessionType === SessionType.COUPLE ? 'h-1/2' : 'h-full'}`}>
          <div className="absolute top-0 left-0 bg-amber-600 text-white text-xs px-2 py-1 z-50 rounded-br font-bold">Client A (Mobile)</div>
          <div className="h-full w-full">
             <ClientView role={Role.CLIENT_A} state={clientA.state} sendAction={clientA.sendAction} />
          </div>
        </div>

        {/* Client B View (Only in Couple Mode) */}
        {host.state.sessionType === SessionType.COUPLE && (
          <div className="relative w-full h-1/2 bg-gray-50">
            <div className="absolute top-0 left-0 bg-pink-600 text-white text-xs px-2 py-1 z-50 rounded-br font-bold">Client B (Mobile)</div>
             <div className="h-full w-full">
                <ClientView role={Role.CLIENT_B} state={clientB.state} sendAction={clientB.sendAction} />
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const JoinScreen: React.FC<{ sessionId: string; onJoin: (role: Role, name: string) => void }> = ({ sessionId, onJoin }) => {
  const [name, setName] = useState('');
  
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-surface p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-primary mb-2">Join Session</h1>
        <p className="text-gray-500 text-sm mb-6">Session ID: <span className="font-mono bg-gray-100 px-1 rounded">{sessionId}</span></p>
        
        <input 
          type="text" 
          placeholder="Enter your name" 
          className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 focus:ring-2 focus:ring-primary outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <p className="text-xs text-gray-400 mb-3 text-left">I am...</p>
        <div className="grid grid-cols-2 gap-3">
           <Button 
             variant="secondary" 
             onClick={() => name && onJoin(Role.CLIENT_A, name)}
             disabled={!name}
           >
             Client A
           </Button>
           <Button 
             variant="secondary" 
             onClick={() => name && onJoin(Role.CLIENT_B, name)}
             disabled={!name}
           >
             Client B
           </Button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [role, setRole] = useState<Role | 'TEST' | null>(null);
  const [joinName, setJoinName] = useState<string>('');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session) {
      setPendingSessionId(session);
    }
  }, []);
  
  const NormalHostView = () => {
    const { state, sendAction } = useHostSession();
    return <TherapistDashboard state={state} sendAction={sendAction} />;
  };

  const NormalClientView = ({ r }: { r: Role }) => {
    // Pass the pendingSessionId to the hook
    const { state, sendAction } = useClientSession(r, joinName, pendingSessionId!);
    return <ClientView role={r} state={state} sendAction={sendAction} />;
  };

  if (pendingSessionId && !role) {
    return (
      <JoinScreen 
        sessionId={pendingSessionId} 
        onJoin={(r, n) => {
          setJoinName(n);
          setRole(r);
        }} 
      />
    );
  }

  if (!role) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-surface p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-primary mb-2">Lumina Therapy</h1>
          <p className="text-gray-500 mb-8">Select your role to join the session.</p>
          
          <div className="space-y-3">
            <Button className="w-full h-14 text-lg" onClick={() => setRole(Role.THERAPIST)}>
              Start as Therapist (Host)
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setRole(Role.CLIENT_A)}>
                Client A
              </Button>
              <Button variant="secondary" onClick={() => setRole(Role.CLIENT_B)}>
                Client B
              </Button>
            </div>
            
            <div className="pt-6 border-t mt-6">
               <Button variant="ghost" className="w-full bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200" onClick={() => setRole('TEST')}>
                🛠 Launch System Test Mode
              </Button>
              <p className="text-xs text-gray-400 mt-2">Split-screen view to test all roles at once.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'TEST') {
    return <SystemTestView />;
  }

  return (
    <React.StrictMode>
      {role === Role.THERAPIST ? (
        <NormalHostView />
      ) : (
        <NormalClientView r={role} />
      )}
    </React.StrictMode>
  );
};

export default App;