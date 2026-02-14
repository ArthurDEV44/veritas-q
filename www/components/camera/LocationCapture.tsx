"use client";

import { useEffect, useState, useCallback } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

  useEffect(() => {
    if (!includeLocation) {
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

  const variant = includeLocation
    ? currentLocation
      ? "success"
      : locationError
        ? "warning"
        : "info"
    : "outline";

  return (
    <Badge
      render={<button type="button" onClick={onToggle} />}
      variant={variant}
      size="lg"
      className="cursor-pointer gap-1.5"
    >
      {includeLocation ? (
        <>
          <MapPin className="w-3.5 h-3.5" />
          <span>
            {currentLocation
              ? "GPS actif"
              : locationError
                ? "GPS erreur"
                : "GPS..."}
          </span>
          {currentLocation && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          )}
        </>
      ) : (
        <>
          <MapPinOff className="w-3.5 h-3.5" />
          <span>GPS off</span>
        </>
      )}
    </Badge>
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
