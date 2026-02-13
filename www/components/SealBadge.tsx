"use client";

import { ShieldCheck, Shield, Clock, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export type SealStatus = "valid" | "pending" | "invalid" | "tampered";
export type TrustTier = "tier0" | "tier1" | "tier2" | "tier3";
export type BadgeSize = "small" | "medium" | "large";

interface SealBadgeProps {
  /** Seal ID for navigation to verification page */
  sealId?: string;
  /** Status of the seal */
  status?: SealStatus;
  /** Trust tier level */
  trustTier?: TrustTier;
  /** Size variant */
  size?: BadgeSize;
  /** Whether the badge should be clickable (navigates to verification) */
  clickable?: boolean;
  /** Position when used as overlay */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Custom className */
  className?: string;
  /** Show external link icon */
  showExternalIcon?: boolean;
  /** Animate entrance */
  animate?: boolean;
  /** Callback when badge is clicked */
  onClick?: () => void;
}

const sizeConfig = {
  small: {
    container: "px-2 py-1 gap-1",
    icon: "w-3 h-3",
    text: "text-xs",
    tierText: "text-[10px]",
  },
  medium: {
    container: "px-3 py-1.5 gap-1.5",
    icon: "w-4 h-4",
    text: "text-sm",
    tierText: "text-xs",
  },
  large: {
    container: "px-4 py-2 gap-2",
    icon: "w-5 h-5",
    text: "text-base",
    tierText: "text-sm",
  },
};

const statusConfig = {
  valid: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-500",
    glow: "shadow-[0_0_15px_rgba(34,197,94,0.3)]",
    icon: ShieldCheck,
    label: "Veritas Seal",
  },
  pending: {
    bg: "bg-foreground/5",
    border: "border-foreground/20",
    text: "text-foreground/60",
    glow: "",
    icon: Clock,
    label: "En attente",
  },
  invalid: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-500",
    glow: "",
    icon: Shield,
    label: "Invalide",
  },
  tampered: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-500",
    glow: "",
    icon: Shield,
    label: "Altere",
  },
};

const positionConfig = {
  "top-left": "top-2 left-2",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-2 right-2",
};

function getTierLabel(tier: TrustTier): string {
  switch (tier) {
    case "tier0":
      return "Anonyme";
    case "tier1":
      return "Tier 1";
    case "tier2":
      return "Reporter";
    case "tier3":
      return "Hardware";
    default:
      return "";
  }
}

export default function SealBadge({
  sealId,
  status = "valid",
  trustTier,
  size = "medium",
  clickable = true,
  position,
  className = "",
  showExternalIcon = false,
  animate = true,
  onClick,
}: SealBadgeProps) {
  const router = useRouter();
  const sizeStyles = sizeConfig[size];
  const statusStyles = statusConfig[status];
  const Icon = statusStyles.icon;

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
      return;
    }
    if (clickable && sealId) {
      router.push(`/verify/${sealId}`);
    }
  }, [clickable, sealId, router, onClick]);

  const positionClass = position ? `absolute ${positionConfig[position]}` : "";
  const isClickable = clickable && (sealId || onClick);

  const badgeContent = (
    <div
      className={`
        inline-flex items-center rounded-full border backdrop-blur-sm
        ${sizeStyles.container}
        ${statusStyles.bg}
        ${statusStyles.border}
        ${statusStyles.text}
        ${status === "valid" ? statusStyles.glow : ""}
        ${isClickable ? "cursor-pointer hover:brightness-110 transition-all" : ""}
        ${positionClass}
        ${className}
      `}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      <Icon className={sizeStyles.icon} />
      <span className={`font-medium ${sizeStyles.text}`}>
        {statusStyles.label}
      </span>
      {trustTier && status === "valid" && (
        <span className={`${sizeStyles.tierText} opacity-70`}>
          ({getTierLabel(trustTier)})
        </span>
      )}
      {showExternalIcon && isClickable && (
        <ExternalLink className={`${sizeStyles.icon} opacity-60`} />
      )}
    </div>
  );

  if (animate) {
    return (
      <div
        className={`${position ? "absolute" : "inline-block"} animate-[scaleIn_0.3s_ease-out]`}
        style={position ? { [position.split("-")[0]]: "0.5rem", [position.split("-")[1]]: "0.5rem" } : undefined}
      >
        {badgeContent}
      </div>
    );
  }

  return badgeContent;
}

/**
 * SealBadgeOverlay - A wrapper component for displaying the badge as an overlay on images
 */
interface SealBadgeOverlayProps {
  /** The image element to overlay */
  children: React.ReactNode;
  /** Props to pass to the SealBadge */
  badgeProps: Omit<SealBadgeProps, "position">;
  /** Position of the badge */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export function SealBadgeOverlay({
  children,
  badgeProps,
  position = "bottom-right",
}: SealBadgeOverlayProps) {
  return (
    <div className="relative inline-block">
      {children}
      <SealBadge {...badgeProps} position={position} />
    </div>
  );
}

/**
 * Utility function to apply watermark to canvas
 * Used for export/share with optional watermark
 */
export async function applyWatermark(
  imageSource: string | HTMLCanvasElement,
  sealId: string,
  options: {
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    opacity?: number;
    scale?: number;
  } = {}
): Promise<string> {
  const { position = "bottom-right", opacity = 0.9, scale = 1 } = options;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    const loadImage = (): Promise<HTMLImageElement | HTMLCanvasElement> => {
      if (imageSource instanceof HTMLCanvasElement) {
        return Promise.resolve(imageSource);
      }
      return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = imageSource;
      });
    };

    loadImage()
      .then((source) => {
        const width = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
        const height = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;

        canvas.width = width;
        canvas.height = height;

        // Draw original image
        ctx.drawImage(source, 0, 0);

        // Watermark dimensions
        const badgeWidth = 180 * scale;
        const badgeHeight = 36 * scale;
        const padding = 16 * scale;
        const borderRadius = badgeHeight / 2;

        // Calculate position
        let x: number, y: number;
        switch (position) {
          case "top-left":
            x = padding;
            y = padding;
            break;
          case "top-right":
            x = width - badgeWidth - padding;
            y = padding;
            break;
          case "bottom-left":
            x = padding;
            y = height - badgeHeight - padding;
            break;
          case "bottom-right":
          default:
            x = width - badgeWidth - padding;
            y = height - badgeHeight - padding;
            break;
        }

        // Draw badge background with rounded corners
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
        ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
        ctx.lineWidth = 2 * scale;

        // Rounded rectangle path
        ctx.beginPath();
        ctx.moveTo(x + borderRadius, y);
        ctx.lineTo(x + badgeWidth - borderRadius, y);
        ctx.arcTo(x + badgeWidth, y, x + badgeWidth, y + borderRadius, borderRadius);
        ctx.lineTo(x + badgeWidth, y + badgeHeight - borderRadius);
        ctx.arcTo(x + badgeWidth, y + badgeHeight, x + badgeWidth - borderRadius, y + badgeHeight, borderRadius);
        ctx.lineTo(x + borderRadius, y + badgeHeight);
        ctx.arcTo(x, y + badgeHeight, x, y + badgeHeight - borderRadius, borderRadius);
        ctx.lineTo(x, y + borderRadius);
        ctx.arcTo(x, y, x + borderRadius, y, borderRadius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw checkmark icon (simplified shield-check)
        const iconSize = 20 * scale;
        const iconX = x + 12 * scale;
        const iconY = y + (badgeHeight - iconSize) / 2;

        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        // Shield shape
        ctx.moveTo(iconX + iconSize / 2, iconY);
        ctx.lineTo(iconX + iconSize, iconY + iconSize * 0.2);
        ctx.lineTo(iconX + iconSize, iconY + iconSize * 0.6);
        ctx.quadraticCurveTo(iconX + iconSize, iconY + iconSize, iconX + iconSize / 2, iconY + iconSize);
        ctx.quadraticCurveTo(iconX, iconY + iconSize, iconX, iconY + iconSize * 0.6);
        ctx.lineTo(iconX, iconY + iconSize * 0.2);
        ctx.closePath();
        ctx.fill();

        // Checkmark inside shield
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 * scale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(iconX + iconSize * 0.3, iconY + iconSize * 0.5);
        ctx.lineTo(iconX + iconSize * 0.45, iconY + iconSize * 0.65);
        ctx.lineTo(iconX + iconSize * 0.7, iconY + iconSize * 0.35);
        ctx.stroke();

        // Draw text
        ctx.fillStyle = "#22c55e";
        ctx.font = `bold ${14 * scale}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText("Veritas Seal", x + 38 * scale, y + badgeHeight / 2);

        ctx.restore();

        resolve(canvas.toDataURL("image/png"));
      })
      .catch(reject);
  });
}
