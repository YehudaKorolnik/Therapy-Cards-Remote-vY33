
import React, { useRef, useState, useEffect } from 'react';
import { WhiteboardItem, Role, ClientState, Action } from '../types';

interface WhiteboardProps {
  items: WhiteboardItem[];
  clients: Record<string, ClientState>;
  currentUserRole: Role;
  isLocked: boolean;
  isLaserMode: boolean; // New Prop
  onMoveItem: (itemId: string, x: number, y: number) => void;
  onLaserMove: (x: number, y: number, active: boolean) => void;
  sendAction?: (action: Action) => void;
}

const CANVAS_SIZE = 2000;

export const Whiteboard: React.FC<WhiteboardProps> = ({
  items,
  clients,
  currentUserRole,
  isLocked,
  isLaserMode,
  onMoveItem,
  onLaserMove,
  sendAction
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.8 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  
  // Immediate Local Feedback for Laser (No Network Lag)
  const [localLaser, setLocalLaser] = useState<{x: number, y: number} | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (containerRef.current) {
       const rect = containerRef.current.getBoundingClientRect();
       setTransform({
         x: (rect.width - CANVAS_SIZE * 0.8) / 2,
         y: (rect.height - CANVAS_SIZE * 0.8) / 2,
         scale: 0.8
       });
    }
  }, []);

  const screenToWorld = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale
    };
  };

  const getLaserColor = (r: Role) => {
    switch (r) {
      case Role.THERAPIST: return '#3b82f6'; // Blue
      case Role.CLIENT_A: return '#f43f5e';   // Rose
      case Role.CLIENT_B: return '#10b981';   // Emerald
      default: return '#f43f5e';
    }
  };

  // --- INPUT HANDLERS ---

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = -e.deltaY * 0.001;
      setTransform(prev => {
        const newScale = Math.min(Math.max(0.3, prev.scale + zoomFactor), 4.0);
        return { ...prev, scale: newScale };
      });
    } else {
       setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  // Unified Start Handler (Mouse & Touch)
  const handleStart = (clientX: number, clientY: number, target: EventTarget) => {
    // 1. LASER MODE: Overrides everything else
    if (isLaserMode) {
      const worldPos = screenToWorld(clientX, clientY);
      const normalizedX = worldPos.x / CANVAS_SIZE;
      const normalizedY = worldPos.y / CANVAS_SIZE;
      
      setLocalLaser({ x: worldPos.x, y: worldPos.y });
      onLaserMove(normalizedX, normalizedY, true);
      return;
    }

    // 2. INTERACTION MODE
    const worldPos = screenToWorld(clientX, clientY);
    const canInteract = !isLocked || currentUserRole === Role.THERAPIST;
    let clickedItemId: string | null = null;

    if (canInteract) {
       // Find clicked item (reverse order for z-index)
       for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i];
          if (
             worldPos.x >= item.x && worldPos.x <= item.x + item.width &&
             worldPos.y >= item.y && worldPos.y <= item.y + item.height
          ) {
             clickedItemId = item.id;
             break;
          }
       }
    }

    if (clickedItemId) {
      setSelectedItemId(clickedItemId);
      const item = items.find(i => i.id === clickedItemId)!;
      setDragItem({
        id: clickedItemId,
        offsetX: worldPos.x - item.x,
        offsetY: worldPos.y - item.y
      });
    } else {
      // Pan Background
      setSelectedItemId(null);
      setIsPanning(true);
      setLastMouse({ x: clientX, y: clientY });
    }
  };

  // Unified Move Handler
  const handleMove = (clientX: number, clientY: number) => {
    // 1. LASER MODE
    if (isLaserMode) {
       const worldPos = screenToWorld(clientX, clientY);
       const normalizedX = worldPos.x / CANVAS_SIZE;
       const normalizedY = worldPos.y / CANVAS_SIZE;
       
       setLocalLaser({ x: worldPos.x, y: worldPos.y });
       onLaserMove(normalizedX, normalizedY, true);
       return;
    }

    // 2. PANNING
    if (isPanning) {
      const dx = clientX - lastMouse.x;
      const dy = clientY - lastMouse.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setLastMouse({ x: clientX, y: clientY });
      return;
    }

    // 3. DRAGGING ITEM
    if (dragItem) {
       const worldPos = screenToWorld(clientX, clientY);
       onMoveItem(dragItem.id, worldPos.x - dragItem.offsetX, worldPos.y - dragItem.offsetY);
    }
  };

  // Unified End Handler
  const handleEnd = (isTouch: boolean) => {
    if (isLaserMode) {
      // If touch (finger lift), hide laser. If mouse (button up), keep laser.
      if (isTouch) {
        setLocalLaser(null);
        onLaserMove(0, 0, false);
      }
    } else {
      setIsPanning(false);
      setDragItem(null);
    }
  };

  // --- REACT EVENT WRAPPERS ---
  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX, e.clientY, e.target);
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);
  const onMouseUp = () => handleEnd(false);
  
  // Explicitly hide laser on mouse leave
  const onMouseLeave = () => {
    if (isLaserMode) {
      setLocalLaser(null);
      onLaserMove(0, 0, false);
    }
    setIsPanning(false);
    setDragItem(null);
  };

  // --- NATIVE TOUCH EVENT WRAPPERS (for cleaner prevention) ---
  const onTouchStart = (e: React.TouchEvent) => {
    // Prevent default if laser mode to stop scrolling/zooming browser
    if (isLaserMode) e.preventDefault(); 
    handleStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
  };
  
  const onTouchMove = (e: React.TouchEvent) => {
    if (isLaserMode) e.preventDefault();
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    handleEnd(true);
  };

  const handleDrop = (e: React.DragEvent) => {
     e.preventDefault();
     if (isLocked && currentUserRole !== Role.THERAPIST) return;

     const data = e.dataTransfer.getData('application/lumina-card');
     if (data && sendAction) {
        const card = JSON.parse(data);
        const worldPos = screenToWorld(e.clientX, e.clientY);
        sendAction({
           type: 'ADD_WB_ITEM',
           payload: {
             x: worldPos.x,
             y: worldPos.y,
             content: card.imageUrl,
             type: 'CARD',
             width: 200,
             height: 300
           },
           sender: currentUserRole
        });
     }
  };

  const resetView = () => {
     if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setTransform({
          x: (rect.width - CANVAS_SIZE * 0.8) / 2,
          y: (rect.height - CANVAS_SIZE * 0.8) / 2,
          scale: 0.8
        });
     }
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-slate-100 overflow-hidden relative select-none touch-none"
      onWheel={handleWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{ cursor: isLaserMode ? 'none' : (isPanning ? 'grabbing' : 'default') }} // Hide default cursor for spotlight effect
    >
      <div 
        className="absolute origin-top-left bg-white shadow-2xl"
        style={{
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          backgroundImage: 'radial-gradient(#e5e7eb 2px, transparent 2px)',
          backgroundSize: '40px 40px'
        }}
      >
        {items.map(item => (
           <div
             key={item.id}
             className={`absolute bg-white shadow-md transition-shadow ${selectedItemId === item.id ? 'ring-4 ring-blue-400 z-30' : 'hover:shadow-xl'}`}
             style={{
               left: item.x,
               top: item.y,
               width: item.width,
               height: item.height,
               transform: `rotate(${item.rotation}deg)`,
               // If Laser Mode is on, disable pointer events on cards so clicks pass through to the board for laser tracking
               pointerEvents: isLaserMode ? 'none' : 'auto',
               cursor: (isLocked && currentUserRole !== Role.THERAPIST) ? 'default' : 'move'
             }}
           >
             <img src={item.content} className="w-full h-full object-contain pointer-events-none bg-white" alt="card" />
             
             {selectedItemId === item.id && (!isLocked || currentUserRole === Role.THERAPIST) && !isLaserMode && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-2 z-50" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                   <button 
                     className="w-10 h-10 bg-white rounded-full shadow hover:bg-gray-100 flex items-center justify-center text-gray-700"
                     onClick={() => sendAction && sendAction({ type: 'ROTATE_WB_ITEM', payload: { id: item.id }, sender: currentUserRole })}
                     title="Rotate"
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                   </button>
                   <button 
                     className="w-10 h-10 bg-white rounded-full shadow hover:bg-red-50 flex items-center justify-center text-red-600"
                     onClick={() => {
                        sendAction && sendAction({ type: 'DELETE_WB_ITEM', payload: { id: item.id }, sender: currentUserRole });
                        setSelectedItemId(null);
                     }}
                     title="Delete"
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                   </button>
                </div>
             )}
           </div>
        ))}

        {/* Render OTHER clients' lasers (Server State) */}
        {(Object.values(clients) as ClientState[]).map(client => {
            if (!client.laser || !client.laser.active || client.role === currentUserRole) return null;
            const color = getLaserColor(client.role);

            return (
              <div
                key={client.id}
                className="absolute w-6 h-6 rounded-full z-50 transition-all duration-75 pointer-events-none"
                style={{
                   left: client.laser.x * CANVAS_SIZE,
                   top: client.laser.y * CANVAS_SIZE,
                   transform: 'translate(-50%, -50%)',
                   backgroundColor: color,
                   boxShadow: `0 0 15px 4px ${color}`,
                   mixBlendMode: 'multiply'
                }}
              />
            );
        })}

        {/* Render LOCAL laser (Immediate Feedback) */}
        {localLaser && (
          <div
            className="absolute w-6 h-6 rounded-full z-50 pointer-events-none"
            style={{
              left: localLaser.x,
              top: localLaser.y,
              transform: 'translate(-50%, -50%)',
              backgroundColor: getLaserColor(currentUserRole),
              boxShadow: `0 0 15px 4px ${getLaserColor(currentUserRole)}`,
              mixBlendMode: 'multiply'
            }}
          />
        )}

      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 bg-white/90 p-2 rounded shadow-lg">
         <button className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-700" onClick={() => setTransform(p => ({...p, scale: Math.min(4, p.scale + 0.1)}))}>+</button>
         <button className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-700" onClick={() => setTransform(p => ({...p, scale: Math.max(0.3, p.scale - 0.1)}))}>-</button>
         <button className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-xs font-bold text-blue-800 mt-2" onClick={resetView}>Reset</button>
      </div>
    </div>
  );
};
