'use client';

import { useState, useMemo } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, Toggle } from '@/components/ui/toggle-group';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { SealFilters } from '@/hooks/useSealsQuery';

interface SealFiltersProps {
  filters: SealFilters;
  onFiltersChange: (filters: SealFilters) => void;
  view: 'grid' | 'list';
  onViewChange: (view: 'grid' | 'list') => void;
}

const mediaTypeOptions = [
  { value: 'image', label: 'Photos', icon: ImageIcon },
  { value: 'video', label: 'Vidéos', icon: Video },
  { value: 'audio', label: 'Audio', icon: Music },
] as const;

const locationOptions = [
  { value: 'true', label: 'Avec GPS', icon: MapPin },
  { value: 'false', label: 'Sans GPS', icon: MapPinOff },
] as const;

export default function SealFiltersComponent({
  filters,
  onFiltersChange,
  view,
  onViewChange,
}: SealFiltersProps) {
  const [open, setOpen] = useState(false);

  const activeFiltersCount = [filters.media_type, filters.has_location].filter(
    (v) => v !== undefined
  ).length;

  const mediaTypeValue = useMemo(
    () => (filters.media_type ? [filters.media_type] : []),
    [filters.media_type]
  );

  const locationValue = useMemo(
    () =>
      filters.has_location !== undefined ? [String(filters.has_location)] : [],
    [filters.has_location]
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
      {/* Top bar: filter toggle + view toggle */}
      <div className="flex items-center justify-between gap-4">
        <CollapsibleTrigger
          render={
            <Button
              variant={activeFiltersCount > 0 ? 'default' : 'outline'}
              size="sm"
            />
          }
        >
          <Filter />
          <span>Filtres</span>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" size="sm">
              {activeFiltersCount}
            </Badge>
          )}
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
        </CollapsibleTrigger>

        {/* View toggle: grid / list */}
        <ToggleGroup
          variant="outline"
          value={[view]}
          onValueChange={(newValue) => {
            if (newValue.length > 0)
              onViewChange(newValue[0] as 'grid' | 'list');
          }}
        >
          <Toggle value="grid" aria-label="Vue grille" size="sm">
            <Grid />
          </Toggle>
          <Toggle value="list" aria-label="Vue liste" size="sm">
            <List />
          </Toggle>
        </ToggleGroup>
      </div>

      {/* Expandable filters panel */}
      <CollapsiblePanel>
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {/* Media type filter */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              Type de média
            </span>
            <ToggleGroup
              value={mediaTypeValue}
              onValueChange={(newValue) => {
                onFiltersChange({
                  ...filters,
                  media_type:
                    newValue.length > 0
                      ? (newValue[0] as 'image' | 'video' | 'audio')
                      : undefined,
                });
              }}
            >
              {mediaTypeOptions.map((option) => (
                <Toggle key={option.value} value={option.value} size="sm">
                  <option.icon />
                  <span>{option.label}</span>
                </Toggle>
              ))}
            </ToggleGroup>
          </div>

          {/* Location filter */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              Localisation
            </span>
            <ToggleGroup
              value={locationValue}
              onValueChange={(newValue) => {
                onFiltersChange({
                  ...filters,
                  has_location:
                    newValue.length > 0
                      ? newValue[0] === 'true'
                      : undefined,
                });
              }}
            >
              {locationOptions.map((option) => (
                <Toggle key={option.value} value={option.value} size="sm">
                  <option.icon />
                  <span>{option.label}</span>
                </Toggle>
              ))}
            </ToggleGroup>
          </div>

          {/* Clear filters */}
          {activeFiltersCount > 0 && (
            <div className="border-t border-border pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onFiltersChange.bind(null, {})}
              >
                <X />
                <span>Effacer les filtres</span>
              </Button>
            </div>
          )}
        </div>
      </CollapsiblePanel>

      {/* Active filter chips (visible when panel is collapsed) */}
      {!open && activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.media_type && (
            <Badge variant="secondary" size="sm">
              {filters.media_type === 'image' && <ImageIcon />}
              {filters.media_type === 'video' && <Video />}
              {filters.media_type === 'audio' && <Music />}
              <span>
                {mediaTypeOptions.find((o) => o.value === filters.media_type)
                  ?.label}
              </span>
              <button
                type="button"
                onClick={() =>
                  onFiltersChange({ ...filters, media_type: undefined })
                }
                className={cn(
                  'ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100'
                )}
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {filters.has_location !== undefined && (
            <Badge variant="secondary" size="sm">
              {filters.has_location ? <MapPin /> : <MapPinOff />}
              <span>{filters.has_location ? 'Avec GPS' : 'Sans GPS'}</span>
              <button
                type="button"
                onClick={() =>
                  onFiltersChange({ ...filters, has_location: undefined })
                }
                className={cn(
                  'ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100'
                )}
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </Collapsible>
  );
}
