import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Circle, Marker, Popup, useMap } from 'react-leaflet';
import { ShieldAlert, Zap, Fuel, Coffee, ShieldCheck, Navigation2, MessageSquare, Menu, Layers, Search, Loader } from 'lucide-react';
import { searchLocation, getAlternativeRoutes, generateGlobalHazards, fetchRealPOIs, aiResponses } from './services/mockData';
import { getTravelShieldResponse } from './services/aiService';
import './index.css';
import L from 'leaflet';

const createEmojiIcon = (emoji) => {
  return new L.DivIcon({
    className: 'custom-emoji-icon',
    html: `<div style="font-size: 24px; text-shadow: 0 2px 4px rgba(0,0,0,0.5); line-height: 1; text-align: center;">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

// Component to recenter map dynamically when a new route is fetched
function MapUpdater({ path }) {
  const map = useMap();
  useEffect(() => {
    if (path && path.length > 0) {
      const bounds = L.latLngBounds(path);
      // Pad bounds slightly to fit UI
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [path, map]);
  return null;
}

function App() {
  const [startQuery, setStartQuery] = useState('Pune, India');
  const [endQuery, setEndQuery] = useState('Mumbai, India');
  const [vehicleType, setVehicleType] = useState('ev');
  const [activeRouteId, setActiveRouteId] = useState('fastest');
  
  const [loading, setLoading] = useState(false);
  const [mapData, setMapData] = useState({
    center: [18.5204, 73.8567], // Pune Default
    routes: {},
    hazards: [],
    pois: {}
  });

  const [layersVisible, setLayersVisible] = useState({ hazards: true, pois: true });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([{ sender: 'ai', text: aiResponses.general }]);
  const [chatInput, setChatInput] = useState('');

  const fetchGlobalRoute = async () => {
    if (!startQuery || !endQuery) return;
    setLoading(true);

    // 1. Geocode Start and End
    const startCoord = await searchLocation(startQuery);
    const endCoord = await searchLocation(endQuery);

    if (!startCoord || !endCoord) {
      alert("Could not find locations. Please try broader terms (e.g. 'Pune' instead of a street).");
      setLoading(false);
      return;
    }

    // 2. Fetch Real Routes via OSRM (with Alternatives)
    const routesData = await getAlternativeRoutes(startCoord, endCoord);

    if (!routesData || Object.keys(routesData).length === 0) {
      alert("Could not find a driving route between these places.");
      setLoading(false);
      return;
    }

    // 3. Fetch Real-World POIs from Overpass and Generate Hazards
    const globalHazards = generateGlobalHazards(startCoord, endCoord);
    const livePOIs = await fetchRealPOIs(startCoord, endCoord);

    setMapData({
      center: startCoord,
      routes: routesData,
      hazards: globalHazards,
      pois: livePOIs
    });

    setLoading(false);
  };

  // Initial Load
  useEffect(() => {
    fetchGlobalRoute();
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const userText = chatInput;
    const newMsgs = [...chatMessages, { sender: 'user', text: userText }];
    setChatMessages(newMsgs);
    setChatInput('');

    // Set loading state message
    setChatMessages(prev => [...prev, { sender: 'ai', text: 'Analyzing routes and safety parameters...', isLoading: true }]);

    const mapContext = {
      startQuery,
      endQuery,
      activeRouteId,
      mapData
    };

    const aiResponseText = await getTravelShieldResponse(newMsgs, mapContext);

    // Replace the loading message with the actual response
    setChatMessages(prev => {
      const filtered = prev.filter(msg => !msg.isLoading);
      return [...filtered, { sender: 'ai', text: aiResponseText }];
    });
  };

  const routesExist = Object.keys(mapData.routes).length > 0;
  const currentRoute = routesExist ? mapData.routes[activeRouteId] : null;

  return (
    <div className="app-container">
      {/* MAP LAYER */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, background: '#0f172a' }}>
        <MapContainer center={mapData.center} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png"
          />
          {currentRoute && <MapUpdater path={currentRoute.path} />}
          
          {/* Routes */}
          {routesExist && Object.values(mapData.routes).map(route => (
            <Polyline
              key={route.id}
              positions={route.path}
              pathOptions={{ 
                color: route.color, 
                weight: route.weight,
                opacity: activeRouteId === route.id ? 1 : 0.3,
                dashArray: activeRouteId === route.id ? null : '5, 10'
              }}
            />
          ))}

          {/* Hazards */}
          {layersVisible.hazards && mapData.hazards.map((zone, idx) => (
            <Circle
              key={idx}
              center={zone.center}
              radius={zone.radius}
              pathOptions={{
                color: zone.risk === 'high' ? 'var(--high-red)' : 'var(--moderate-yellow)',
                fillColor: zone.risk === 'high' ? 'var(--high-red)' : 'var(--moderate-yellow)',
                fillOpacity: 0.45, // Much more prominent fill
                weight: 4 // Thicker borders
              }}
            />
          ))}

          {/* POIs */}
          {layersVisible.pois && mapData.pois[vehicleType] && mapData.pois[vehicleType].map(poi => (
            <Marker key={`veh-${poi.id}`} position={poi.pos} icon={createEmojiIcon(vehicleType === 'ev' ? '⚡️' : '⛽️')}>
              <Popup>{poi.name} <br/> {poi.available} Available</Popup>
            </Marker>
          ))}
          {layersVisible.pois && mapData.pois.food && mapData.pois.food.map(poi => (
            <Marker key={`food-${poi.id}`} position={poi.pos} icon={createEmojiIcon('🍔')}>
              <Popup>{poi.name} <br/> {poi.rating} Stars | Safety: {poi.safety}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* SEARCH PANEL */}
      <div className="top-search-panel" style={{ position: 'absolute', top: '20px', left: '20px', right: '20px', zIndex: 10 }}>
        <div className="glass-panel" style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <Menu size={24} color="var(--text-main)" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <input 
                type="text" 
                value={startQuery} 
                onChange={e => setStartQuery(e.target.value)}
                placeholder="Start Location (e.g. Pune, India)"
                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '5px', outline: 'none' }} 
              />
              <input 
                type="text" 
                value={endQuery} 
                onChange={e => setEndQuery(e.target.value)}
                placeholder="Destination (e.g. Mumbai, India)"
                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '5px', outline: 'none' }} 
              />
            </div>
            <button 
                onClick={fetchGlobalRoute}
                disabled={loading}
                style={{ padding: '10px', borderRadius: '8px', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {loading ? <Loader size={20} className="spinner" style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={20} />}
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: '10px' }}>
              <button 
                type="button"
                onClick={() => setVehicleType('ev')}
                style={{ cursor: 'pointer', padding: '5px', borderRadius: '8px', background: vehicleType === 'ev' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)' }}>
                <Zap size={18} />
              </button>
              <button 
                type="button"
                onClick={() => setVehicleType('petrol')}
                style={{ cursor: 'pointer', padding: '5px', borderRadius: '8px', background: vehicleType === 'petrol' ? 'var(--moderate-yellow)' : 'rgba(255,255,255,0.1)' }}>
                <Fuel size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FLOATING ACTION BUTTONS */}
      <div style={{ position: 'absolute', right: '20px', top: '150px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <button className="glass-panel" style={{ padding: '12px', borderRadius: '50%' }} onClick={() => setLayersVisible({ ...layersVisible, hazards: !layersVisible.hazards })}>
          <ShieldAlert size={24} color={layersVisible.hazards ? 'var(--high-red)' : 'var(--text-muted)'} />
        </button>
        <button className="glass-panel" style={{ padding: '12px', borderRadius: '50%' }} onClick={() => setLayersVisible({ ...layersVisible, pois: !layersVisible.pois })}>
          <Layers size={24} color={layersVisible.pois ? 'var(--accent-blue)' : 'var(--text-muted)'} />
        </button>
        <button className="btn-primary" style={{ padding: '15px', borderRadius: '50%', animation: 'pulse-glow 2s infinite', marginTop: '20px' }} onClick={() => setChatOpen(true)}>
          <Navigation2 size={24} />
        </button>
      </div>

      {/* BOTTOM ROUTE SHEET */}
      {(!chatOpen && routesExist) && (
        <div className="glass-panel" style={{ position: 'absolute', bottom: '20px', left: '20px', right: '20px', zIndex: 10, padding: '20px', animation: 'slideUp 0.3s ease-out' }}>
          <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck color="var(--safe-green)" /> Route Options
          </h3>
          <div className="horizontal-scroll" style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px', scrollBehavior: 'smooth', scrollSnapType: 'x mandatory' }}>
            {Object.values(mapData.routes).map(route => (
              <div 
                key={route.id}
                onClick={() => setActiveRouteId(route.id)}
                style={{ 
                  flex: '0 0 160px',
                  padding: '15px', 
                  borderRadius: '12px',
                  background: activeRouteId === route.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: `1px solid ${activeRouteId === route.id ? route.color : 'rgba(255,255,255,0.05)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  scrollSnapAlign: 'start'
                }}
              >
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: route.color }}>{route.time}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '5px' }}>{route.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '5px' }}>{route.distance} • {route.riskScore}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI ASSISTANT CHAT MODAL */}
      {chatOpen && (
        <div className="glass-panel" style={{ 
            position: 'absolute', top: '20px', bottom: '20px', left: '20px', right: '20px', zIndex: 20, 
            display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out', background: 'var(--bg-panel-solid)'
          }}>
          <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><ShieldCheck color="var(--safe-green)" /> AI Travel Shield</h3>
            <button onClick={() => setChatOpen(false)} style={{ color: 'var(--text-muted)' }}>Close</button>
          </div>
          
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ 
                  alignSelf: msg.sender === 'ai' ? 'flex-start' : 'flex-end',
                  background: msg.sender === 'ai' ? 'rgba(255,255,255,0.05)' : 'var(--accent-blue)',
                  padding: '12px 18px',
                  borderRadius: '16px',
                  maxWidth: '80%',
                  lineHeight: '1.4'
                }}>
                {msg.text}
              </div>
            ))}
          </div>

          <form onSubmit={handleSendMessage} style={{ padding: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask about route safety, food stops..." 
              style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: 'none', padding: '15px', borderRadius: '12px', color: 'white', outline: 'none' }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}>
              <MessageSquare size={20} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
