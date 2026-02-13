'use client';

import { useState } from 'react';
import {
  Filter,
  Image as ImageIcon,
  Video,
  Music,
  MapPin,
  MapPinOff,
  Grid,
  List,
  X,
  ChevronDown,
} from 'lucide-react';
import type { SealFilters } from '@/hooks/useSealsQuery';

interface SealFiltersProps {
  filters: SealFilters;
  onFiltersChange: (filters: SealFilters) => void;
  view: 'grid' | 'list';
  onViewChange: (view: 'grid' | 'list') => void;
}

const mediaTypeOptions = [
  { value: undefined, label: 'Tous', icon: null },
  { value: 'image' as const, label: 'Photos', icon: ImageIcon },
  { value: 'video' as const, label: 'Videos', icon: Video },
  { value: 'audio' as const, label: 'Audio', icon: Music },
];

const locationOptions = [
  { value: undefined, label: 'Tous' },
  { value: true, label: 'Avec GPS', icon: MapPin },
  { value: false, label: 'Sans GPS', icon: MapPinOff },
];

export default function SealFilters({
  filters,
  onFiltersChange,
  view,
  onViewChange,
}: SealFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);

  const activeFiltersCount = [
    filters.media_type,
    filters.has_location,
  ].filter((v) => v !== undefined).length;

  const clearFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4">
        {/* Filter toggle button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`transition-transform active:scale-95 flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            showFilters || activeFiltersCount > 0
              ? 'bg-quantum/10 border-quantum/30 text-quantum'
              : 'bg-surface-elevated border-border hover:border-quantum/30'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filtres</span>
          {activeFiltersCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-quantum text-black text-xs font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              showFilters ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 bg-surface-elevated rounded-lg border border-border">
          <button
            onClick={() => onViewChange('grid')}
            className={`p-2 rounded-md transition-colors ${
              view === 'grid'
                ? 'bg-quantum/20 text-quantum'
                : 'text-foreground/60 hover:text-foreground'
            }`}
            title="Vue grille"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewChange('list')}
            className={`p-2 rounded-md transition-colors ${
              view === 'list'
                ? 'bg-quantum/20 text-quantum'
                : 'text-foreground/60 hover:text-foreground'
            }`}
            title="Vue liste"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable filters panel */}
      {showFilters && (
        <div className="animate-[slideDown_0.3s_ease-out] overflow-hidden">
            <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-4">
              {/* Media type filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/60">
                  Type de media
                </label>
                <div className="flex flex-wrap gap-2">
                  {mediaTypeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = filters.media_type === option.value;
                    return (
                      <button
                        key={option.label}
                        onClick={() =>
                          onFiltersChange({
                            ...filters,
                            media_type: option.value,
                          })
                        }
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-quantum/20 text-quantum border border-quantum/30'
                            : 'bg-surface border border-border hover:border-quantum/30'
                        }`}
                      >
                        {Icon && <Icon className="w-4 h-4" />}
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/60">
                  Localisation
                </label>
                <div className="flex flex-wrap gap-2">
                  {locationOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = filters.has_location === option.value;
                    return (
                      <button
                        key={option.label}
                        onClick={() =>
                          onFiltersChange({
                            ...filters,
                            has_location: option.value,
                          })
                        }
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-quantum/20 text-quantum border border-quantum/30'
                            : 'bg-surface border border-border hover:border-quantum/30'
                        }`}
                      >
                        {Icon && <Icon className="w-4 h-4" />}
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Clear filters button */}
              {activeFiltersCount > 0 && (
                <div className="pt-2 border-t border-border">
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Effacer les filtres</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Active filters chips (when panel is closed) */}
      {!showFilters && activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.media_type && (
            <span className="flex items-center gap-1.5 px-2 py-1 bg-quantum/10 text-quantum rounded-full text-xs">
              {filters.media_type === 'image' && <ImageIcon className="w-3 h-3" />}
              {filters.media_type === 'video' && <Video className="w-3 h-3" />}
              {filters.media_type === 'audio' && <Music className="w-3 h-3" />}
              <span>
                {mediaTypeOptions.find((o) => o.value === filters.media_type)?.label}
              </span>
              <button
                onClick={() =>
                  onFiltersChange({ ...filters, media_type: undefined })
                }
                className="hover:text-quantum-dim"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.has_location !== undefined && (
            <span className="flex items-center gap-1.5 px-2 py-1 bg-quantum/10 text-quantum rounded-full text-xs">
              {filters.has_location ? (
                <MapPin className="w-3 h-3" />
              ) : (
                <MapPinOff className="w-3 h-3" />
              )}
              <span>{filters.has_location ? 'Avec GPS' : 'Sans GPS'}</span>
              <button
                onClick={() =>
                  onFiltersChange({ ...filters, has_location: undefined })
                }
                className="hover:text-quantum-dim"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
