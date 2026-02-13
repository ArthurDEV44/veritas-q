"use client";

import { useEffect, useState, useCallback } from "react";
import { MapPin, MapPinOff } from "lucide-react";

export interface CapturedLocation {
  lat: number;
  lng: number;
  altitude?: number;
}

interface LocationCaptureProps {
  includeLocation: boolean;
  onToggle: () => void;
  onLocationChange?: (location: GeolocationPosition | null) => void;
}

export default function LocationCapture({
  includeLocation,
  onToggle,
  onLocationChange,
}: LocationCaptureProps) {
  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Request geolocation when GPS is enabled
  useEffect(() => {
    if (!includeLocation) {
      // Use callback pattern to update state based on external system changes
      onLocationChange?.(null);
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation(position);
        setLocationError(null);
        onLocationChange?.(position);
      },
      (error) => {
        setLocationError(error.message);
        setCurrentLocation(null);
        onLocationChange?.(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setCurrentLocation(null);
      setLocationError(null);
    };
  }, [includeLocation, onLocationChange]);

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
        includeLocation
          ? currentLocation
            ? "bg-green-500/20 text-green-400"
            : locationError
              ? "bg-yellow-500/20 text-yellow-400"
              : "bg-quantum/20 text-quantum"
          : "bg-surface text-foreground/40"
      }`}
    >
      {includeLocation ? (
        <>
          <MapPin className="w-4 h-4" />
          <span>
            {currentLocation
              ? "GPS actif"
              : locationError
                ? "GPS erreur"
                : "GPS..."}
          </span>
        </>
      ) : (
        <>
          <MapPinOff className="w-4 h-4" />
          <span>GPS off</span>
        </>
      )}
    </button>
  );
}

/**
 * Hook to manage location capture persistence
 */
export function useLocationPreference() {
  const [includeLocation, setIncludeLocation] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("veritas_include_gps") !== "false";
    }
    return true;
  });

  const toggleLocation = useCallback(() => {
    setIncludeLocation((prev) => {
      const newValue = !prev;
      localStorage.setItem("veritas_include_gps", String(newValue));
      return newValue;
    });
  }, []);

  return { includeLocation, toggleLocation };
}
