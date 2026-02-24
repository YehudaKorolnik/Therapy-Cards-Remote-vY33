
import React, { useState, useRef } from 'react';
import { SessionState, Action, Role, Mode, SessionType, Card, ClientState } from '../types';
import { Button } from './Button';
import { Whiteboard } from './Whiteboard';

interface TherapistDashboardProps {
  state: SessionState;
  sendAction: (action: Action) => void;
}

export const TherapistDashboard: React.FC<TherapistDashboardProps> = ({ state, sendAction }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // UI State for processing images
  const myState = state.clients[Role.THERAPIST];

  const getClientCard = (role: Role) => {
    const client = state.clients[role];
    if (!client) return null;
    const deckOrder = state.deckOrders[role];
    if (!deckOrder) return null;
    const cardId = deckOrder[client.currentCardIndex];
    return state.deck.find(c => c.id === cardId);
  };

  const handleImportTray = (role: Role) => {
    sendAction({ type: 'IMPORT_TRAY', payload: { sourceRole: role }, sender: Role.THERAPIST });
  };

  const copyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?session=${state.sessionId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to compress images before sending over PeerJS
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension 800px (Good balance for quality vs speed)
          const MAX_SIZE = 800;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG 70% quality
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      };
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsProcessing(true);
      const files = Array.from(e.target.files) as File[];
      const newCards: Card[] = [];

      try {
        // Process sequentially to avoid memory spikes
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const compressedBase64 = await compressImage(file);
          newCards.push({
            id: `custom-${Date.now()}-${i}`,
            title: file.name,
            imageUrl: compressedBase64,
            rotation: 0
          });
        }
        
        sendAction({ type: 'UPLOAD_DECK', payload: newCards, sender: Role.THERAPIST });
      } catch (err) {
        console.error("Error processing images", err);
        alert("Failed to process some images.");
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const updateClientName = (role: string, name: string) => {
    sendAction({ 
      type: 'UPDATE_SETTINGS', 
      payload: { names: { [role]: name } }, 
      sender: Role.THERAPIST 
    });
  };

  const forceClientView = (role: Role, cardId: string) => {
    sendAction({ type: 'JUMP_TO_CARD', payload: { targetRole: role, cardId }, sender: Role.THERAPIST });
  };

  const handleDragStart = (e: React.DragEvent, card: Card) => {
    e.dataTransfer.setData('application/lumina-card', JSON.stringify(card));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getLaserColor = (r: Role) => {
    switch (r) {
      case Role.THERAPIST: return '#3b82f6'; // Blue
      case Role.CLIENT_A: return '#f43f5e';   // Rose
      case Role.CLIENT_B: return '#10b981';   // Emerald
      default: return '#f43f5e';
    }
  };

  // Handle Therapist Laser Logic for Deck Mode
  const handleTherapistMouseMove = (e: React.MouseEvent) => {
    if (myState?.laserMode && state.mode === Mode.DECK) {
       const rect = e.currentTarget.getBoundingClientRect();
       const x = (e.clientX - rect.left) / rect.width;
       const y = (e.clientY - rect.top) / rect.height;
       
       if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
          sendAction({ type: 'UPDATE_LASER', payload: { x, y, active: true }, sender: Role.THERAPIST });
       }
    }
  };

  const handleTherapistMouseLeave = () => {
     if (myState?.laserMode) {
        sendAction({ type: 'UPDATE_LASER', payload: { active: false }, sender: Role.THERAPIST });
     }
  };

  return (
    <div className="h-screen w-full flex bg-gray-100 overflow-hidden font-sans text-gray-800">
      
      {/* Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col shadow-lg z-20 flex-shrink-0 h-full">
        <div className="p-4 border-b bg-teal-50">
          <h1 className="text-xl font-bold text-primary">Lumina Host</h1>
          <div className="flex items-center justify-between mt-2">
             <span className="text-xs font-mono bg-white border px-2 py-1 rounded text-gray-600 select-all">
               ID: {state.sessionId}
             </span>
             <Button size="sm" variant="secondary" className="text-xs h-7" onClick={copyLink}>
               {copied ? 'Copied!' : 'Copy Link'}
             </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
          {/* Config */}
          <div className="p-4 border-b">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configuration</h3>
            
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4 relative">
              {state.status === 'ACTIVE' && <div className="absolute inset-0 bg-white/50 cursor-not-allowed z-10" title="Cannot change mode during active session" />}
              <button 
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${state.sessionType === SessionType.SINGLE ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                onClick={() => sendAction({ type: 'UPDATE_SETTINGS', payload: { sessionType: SessionType.SINGLE }, sender: Role.THERAPIST })}
              >
                Single
              </button>
              <button 
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${state.sessionType === SessionType.COUPLE ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                onClick={() => sendAction({ type: 'UPDATE_SETTINGS', payload: { sessionType: SessionType.COUPLE }, sender: Role.THERAPIST })}
              >
                Couple
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Client A Name</label>
                <input 
                  className="w-full border rounded px-2 py-1 text-sm focus:border-primary outline-none"
                  value={state.clients[Role.CLIENT_A].name}
                  onChange={(e) => updateClientName(Role.CLIENT_A, e.target.value)}
                />
              </div>
              {state.sessionType === SessionType.COUPLE && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Client B Name</label>
                  <input 
                    className="w-full border rounded px-2 py-1 text-sm focus:border-primary outline-none"
                    value={state.clients[Role.CLIENT_B].name}
                    onChange={(e) => updateClientName(Role.CLIENT_B, e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

           {/* Live Trays */}
           <div className="p-4 space-y-4 border-b">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Live Trays</h3>
            {[Role.CLIENT_A, Role.CLIENT_B].map((role) => {
              if (state.sessionType === SessionType.SINGLE && role === Role.CLIENT_B) return null;
              const client = state.clients[role as Role];
              return (
                <div key={role} className="bg-slate-50 p-3 rounded-lg border">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`font-semibold text-sm ${role === Role.CLIENT_A ? 'text-amber-600' : 'text-pink-600'}`}>
                      {client.name}
                    </span>
                    <span className="text-xs bg-white px-2 py-0.5 rounded border">
                      {client.tray.length} cards
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {client.tray.map(cardId => {
                      const card = state.deck.find(c => c.id === cardId);
                      if (!card) return null;
                      const rot = client.cardRotations[cardId] || 0;
                      const displayRot = (card.rotation || 0) + rot;

                      return (
                        <img 
                          key={cardId} 
                          src={card.imageUrl} 
                          className="w-full aspect-[2/3] object-contain bg-white rounded shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-blue-300"
                          style={{ transform: `rotate(${displayRot}deg)` }}
                          title="Drag to Whiteboard or Click to Show"
                          draggable
                          onDragStart={(e) => handleDragStart(e, card)}
                          onClick={() => forceClientView(role as Role, cardId)}
                        />
                      )
                    })}
                  </div>
                  {client.tray.length === 0 && <span className="text-xs text-gray-400 block text-center py-2 italic">Empty Tray</span>}
                  {client.tray.length > 0 && (
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => handleImportTray(role as Role)}>
                        Import All
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Deck Management */}
          <div className="p-4 pb-20">
             <div className="flex justify-between items-center mb-3">
               <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Card Deck ({state.deck.length})</h3>
               <div className="space-x-1">
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    multiple 
                    accept="image/*" 
                    onChange={handleFileUpload} 
                 />
                 <button className="text-xs text-blue-600 hover:underline" onClick={() => fileInputRef.current?.click()}>
                   {isProcessing ? 'Processing...' : 'Upload'}
                 </button>
                 <span className="text-gray-300">|</span>
                 <button className="text-xs text-red-600 hover:underline" onClick={() => sendAction({ type: 'CLEAR_DECK', sender: Role.THERAPIST })}>Clear</button>
               </div>
             </div>
             <div className="grid grid-cols-3 gap-2">
                {state.deck.map(card => (
                  <div 
                    key={card.id} 
                    className="aspect-[2/3] relative group bg-gray-100 rounded overflow-hidden border hover:border-blue-400 transition-colors cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                  >
                     <img src={card.imageUrl} className="w-full h-full object-contain bg-white" alt="thumbnail" />
                     <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity z-10">
                        <button onClick={() => forceClientView(Role.CLIENT_A, card.id)} className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded w-16 hover:bg-amber-500">Show A</button>
                        {state.sessionType === SessionType.COUPLE && (
                          <button onClick={() => forceClientView(Role.CLIENT_B, card.id)} className="text-[10px] bg-pink-600 text-white px-2 py-0.5 rounded w-16 hover:bg-pink-500">Show B</button>
                        )}
                     </div>
                     <button 
                        className="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 z-20 hover:bg-red-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendAction({ type: 'DELETE_CARD', payload: { id: card.id }, sender: Role.THERAPIST });
                        }}
                     >
                       ×
                     </button>
                  </div>
                ))}
             </div>
             {state.deck.length === 0 && <div className="text-center text-xs text-gray-400 italic mt-4">No cards uploaded</div>}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 mt-auto">
          <Button className="w-full" variant="danger" onClick={() => sendAction({ type: 'RESET', sender: Role.THERAPIST })}>
            Reset Session
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm z-10">
          <div className="flex space-x-4">
            <Button 
              variant={state.mode === Mode.DECK ? 'primary' : 'secondary'}
              onClick={() => sendAction({ type: 'SET_MODE', payload: Mode.DECK, sender: Role.THERAPIST })}
            >
              Deck View
            </Button>
            <Button 
              variant={state.mode === Mode.WHITEBOARD ? 'primary' : 'secondary'}
              onClick={() => sendAction({ type: 'SET_MODE', payload: Mode.WHITEBOARD, sender: Role.THERAPIST })}
            >
              Whiteboard
            </Button>
          </div>
          
          <div className="flex items-center space-x-4">
             {/* Consistent Spotlight Button */}
             <button 
               className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border shadow-sm ${myState?.laserMode ? 'bg-green-600 text-white border-green-600 ring-2 ring-green-200' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
               onClick={() => sendAction({ type: 'TOGGLE_LASER_MODE', sender: Role.THERAPIST })}
               title="Toggle Spotlight"
             >
                {/* Magic Wand Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 2 2 2-2 2-2-2 2-2Z"/><path d="m5 17 2 2-2 2-2-2 2-2Z"/><path d="m2 2 20 20"/><path d="m19 13-4-4"/><path d="m11 15-4-4"/></svg>
             </button>

            {state.mode === Mode.WHITEBOARD && (
               <Button 
                variant={state.whiteboard.locked ? 'danger' : 'secondary'}
                onClick={() => sendAction({ type: 'TOGGLE_LOCK', sender: Role.THERAPIST })}
               >
                 {state.whiteboard.locked ? 'Unlock Clients' : 'Lock Clients'}
               </Button>
            )}
            <div className={`text-sm font-medium px-3 py-1 rounded ${state.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {state.status === 'WAITING' ? 'Waiting for Start' : 'Session Active'}
            </div>
            {state.status === 'WAITING' && (
               <Button onClick={() => sendAction({ type: 'START_SESSION', sender: Role.THERAPIST })}>
                 Start Session
               </Button>
            )}
          </div>
        </div>

        {/* Viewport */}
        <div className="flex-1 bg-gray-200 relative overflow-hidden">
          {state.mode === Mode.DECK ? (
            <div 
              className="h-full flex items-center justify-center p-8 gap-8 relative"
            >
              {[Role.CLIENT_A, Role.CLIENT_B].map(role => {
                 if (state.sessionType === SessionType.SINGLE && role === Role.CLIENT_B) return null;
                 const card = getClientCard(role as Role);
                 const client = state.clients[role as Role];
                 
                 const clientRot = (card && client.cardRotations) ? (client.cardRotations[card.id] || 0) : 0;
                 const totalRotation = (card?.rotation || 0) + clientRot;

                 return (
                   <div key={role} className="flex flex-col items-center w-80">
                     <div 
                       className={`relative w-64 aspect-[9/19] rounded-2xl shadow-xl bg-white flex items-center justify-center overflow-hidden border-4 ${role === Role.CLIENT_A ? 'border-amber-400' : 'border-pink-400'}`}
                       onMouseMove={handleTherapistMouseMove}
                       onMouseLeave={handleTherapistMouseLeave}
                       style={{ cursor: myState?.laserMode ? 'none' : 'default' }}
                     >
                        {card ? (
                          <div className="relative w-full h-full bg-gray-50 p-4 flex items-center justify-center">
                             <img 
                               src={card.imageUrl} 
                               className="max-w-full max-h-full object-contain shadow-md bg-white transition-transform duration-300"
                               style={{ transform: `rotate(${totalRotation}deg)` }}
                             />
                          </div>
                        ) : (
                          <span className="text-gray-500 text-center px-4">No Card</span>
                        )}
                        
                        {!client.isConnected && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-red-500 font-bold z-50">
                            Disconnected
                          </div>
                        )}

                        {/* CLIENT LASERS */}
                        {(Object.values(state.clients) as ClientState[]).map((c) => {
                           if (!c.laser || !c.laser.active) return null;
                           const color = getLaserColor(c.role);
                           return (
                             <div 
                               key={c.id}
                               className="absolute w-6 h-6 rounded-full z-50 transition-all duration-75"
                               style={{
                                 backgroundColor: color,
                                 boxShadow: `0 0 15px 4px ${color}`,
                                 mixBlendMode: 'multiply',
                                 left: `${c.laser!.x * 100}%`,
                                 top: `${c.laser!.y * 100}%`,
                                 transform: 'translate(-50%, -50%)'
                               }}
                             />
                           )
                        })}
                     </div>
                     <h3 className="mt-4 font-bold text-gray-700">{client.name}</h3>
                     <p className="text-sm text-gray-500">Card {client.currentCardIndex + 1}</p>
                   </div>
                 )
              })}
            </div>
          ) : (
            <div className="h-full w-full">
               <Whiteboard 
                  items={state.whiteboard.items}
                  clients={state.clients}
                  currentUserRole={Role.THERAPIST}
                  isLocked={false}
                  isLaserMode={myState?.laserMode} // Passed Down
                  onMoveItem={(id, x, y) => sendAction({ type: 'MOVE_WB_ITEM', payload: { id, x, y }, sender: Role.THERAPIST })}
                  onLaserMove={(x, y, active) => {
                    // Logic is handled inside Whiteboard, we just relay
                    sendAction({ type: 'UPDATE_LASER', payload: { x, y, active }, sender: Role.THERAPIST });
                  }}
                  sendAction={sendAction}
               />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
