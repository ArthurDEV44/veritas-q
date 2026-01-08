'use client';

import { useRef } from 'react';
import { MapPin } from 'lucide-react';

interface MiniMapProps {
  lat: number;
  lng: number;
  altitude?: number;
  className?: string;
}

export default function MiniMap({ lat, lng, altitude, className = '' }: MiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  // Generate OpenStreetMap static tile URL
  const zoom = 15;
  const tileX = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
  const tileY = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
  );

  // Static map image URL from OSM tiles
  const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;

  // Format coordinates for display
  const formatCoord = (value: number, isLat: boolean) => {
    const direction = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    const absValue = Math.abs(value);
    const degrees = Math.floor(absValue);
    const minutes = Math.floor((absValue - degrees) * 60);
    const seconds = ((absValue - degrees - minutes / 60) * 3600).toFixed(1);
    return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
  };

  return (
    <div className={`rounded-lg overflow-hidden bg-surface-elevated ${className}`}>
      {/* Map tile with marker overlay */}
      <div
        ref={mapRef}
        className="relative w-full h-32 bg-surface"
        style={{
          backgroundImage: `url(${tileUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Center marker */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <MapPin className="w-8 h-8 text-quantum drop-shadow-lg" fill="currentColor" />
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-quantum/50"
              style={{ filter: 'blur(2px)' }}
            />
          </div>
        </div>

        {/* Attribution overlay */}
        <div className="absolute bottom-1 right-1 text-[8px] text-white/60 bg-black/40 px-1 rounded">
          OSM
        </div>
      </div>

      {/* Coordinates display */}
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground/40">Latitude</span>
          <span className="font-mono text-foreground/80">{formatCoord(lat, true)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground/40">Longitude</span>
          <span className="font-mono text-foreground/80">{formatCoord(lng, false)}</span>
        </div>
        {altitude !== undefined && altitude !== null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/40">Altitude</span>
            <span className="font-mono text-foreground/80">{Math.round(altitude)} m</span>
          </div>
        )}
      </div>
    </div>
  );
}
