'use client';

import { motion } from 'framer-motion';
import { Clock, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export type PendingStatus = 'pending' | 'syncing' | 'failed';

interface PendingSealBadgeProps {
  /** Status of the pending capture */
  status: PendingStatus;
  /** Size of the badge */
  size?: 'small' | 'medium' | 'large';
  /** Position for overlay mode */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Callback for retry button (only shown when failed) */
  onRetry?: () => void;
  /** Show as an overlay */
  overlay?: boolean;
}

const sizeConfigs = {
  small: {
    badge: 'px-2 py-1 text-xs gap-1',
    icon: 'w-3 h-3',
  },
  medium: {
    badge: 'px-3 py-1.5 text-sm gap-1.5',
    icon: 'w-4 h-4',
  },
  large: {
    badge: 'px-4 py-2 text-base gap-2',
    icon: 'w-5 h-5',
  },
};

const positionClasses = {
  'top-left': 'absolute top-2 left-2',
  'top-right': 'absolute top-2 right-2',
  'bottom-left': 'absolute bottom-2 left-2',
  'bottom-right': 'absolute bottom-2 right-2',
};

const statusConfigs = {
  pending: {
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    label: 'En attente',
    Icon: Clock,
  },
  syncing: {
    bg: 'bg-quantum/20',
    border: 'border-quantum/40',
    text: 'text-quantum',
    label: 'Synchronisation...',
    Icon: Loader2,
  },
  failed: {
    bg: 'bg-red-500/20',
    border: 'border-red-500/40',
    text: 'text-red-400',
    label: 'Echec',
    Icon: AlertCircle,
  },
};

export default function PendingSealBadge({
  status,
  size = 'medium',
  position,
  onRetry,
  overlay = false,
}: PendingSealBadgeProps) {
  const sizeConfig = sizeConfigs[size];
  const statusConfig = statusConfigs[status];
  const Icon = statusConfig.Icon;

  const baseClasses = `
    flex items-center rounded-full backdrop-blur-sm border
    ${sizeConfig.badge}
    ${statusConfig.bg}
    ${statusConfig.border}
    ${statusConfig.text}
  `;

  const positionClass = overlay && position ? positionClasses[position] : '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`${baseClasses} ${positionClass}`}
    >
      {status === 'syncing' ? (
        <Icon className={`${sizeConfig.icon} animate-spin`} />
      ) : (
        <Icon className={sizeConfig.icon} />
      )}
      <span className="font-medium">{statusConfig.label}</span>

      {/* Retry button for failed status */}
      {status === 'failed' && onRetry && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="ml-1 p-0.5 rounded-full hover:bg-white/10 transition-colors"
          title="Reessayer"
        >
          <RefreshCw className={`${sizeConfig.icon} hover:rotate-180 transition-transform duration-300`} />
        </button>
      )}
    </motion.div>
  );
}

/**
 * Overlay helper to position badge on a media item
 */
export function PendingSealBadgeOverlay({
  status,
  onRetry,
}: {
  status: PendingStatus;
  onRetry?: () => void;
}) {
  return (
    <PendingSealBadge
      status={status}
      size="small"
      position="bottom-right"
      overlay={true}
      onRetry={onRetry}
    />
  );
}
