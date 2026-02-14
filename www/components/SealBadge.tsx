"use client";

import { ShieldCheck, Shield, Clock, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

const sizeMap: Record<BadgeSize, "sm" | "default" | "lg"> = {
  small: "sm",
  medium: "default",
  large: "lg",
};

const positionClasses: Record<string, string> = {
  "top-left": "absolute top-2 left-2",
  "top-right": "absolute top-2 right-2",
  "bottom-left": "absolute bottom-2 left-2",
  "bottom-right": "absolute bottom-2 right-2",
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

function getConfig(status: SealStatus, trustTier?: TrustTier) {
  if (status === "valid") {
    switch (trustTier) {
      case "tier3":
        return {
          variant: "default" as const,
          Icon: ShieldCheck,
          label: "Veritas Seal",
          glow: true,
        };
      case "tier2":
        return {
          variant: "success" as const,
          Icon: ShieldCheck,
          label: "Veritas Seal",
          glow: false,
        };
      default:
        return {
          variant: "outline" as const,
          Icon: Shield,
          label: "Veritas Seal",
          glow: false,
        };
    }
  }

  switch (status) {
    case "pending":
      return {
        variant: "secondary" as const,
        Icon: Clock,
        label: "En attente",
        glow: false,
      };
    case "invalid":
      return {
        variant: "error" as const,
        Icon: Shield,
        label: "Invalide",
        glow: false,
      };
    case "tampered":
      return {
        variant: "warning" as const,
        Icon: Shield,
        label: "Altere",
        glow: false,
      };
    default:
      return {
        variant: "outline" as const,
        Icon: Shield,
        label: status,
        glow: false,
      };
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
  const config = getConfig(status, trustTier);
  const { Icon } = config;
  const isClickable = clickable && !!(sealId || onClick);

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
      return;
    }
    if (clickable && sealId) {
      router.push(`/verify/${sealId}`);
    }
  }, [clickable, sealId, router, onClick]);

  return (
    <Badge
      variant={config.variant}
      size={sizeMap[size]}
      render={isClickable ? <button type="button" /> : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={
        isClickable
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      className={cn(
        config.glow && "quantum-glow-sm",
        position && positionClasses[position],
        position && "backdrop-blur-sm",
        animate && "animate-scale-in",
        className,
      )}
    >
      <Icon />
      <span>{config.label}</span>
      {trustTier && status === "valid" && (
        <span className="opacity-70">({getTierLabel(trustTier)})</span>
      )}
      {showExternalIcon && isClickable && <ExternalLink />}
    </Badge>
  );
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
        const width =
          source instanceof HTMLCanvasElement
            ? source.width
            : source.naturalWidth;
        const height =
          source instanceof HTMLCanvasElement
            ? source.height
            : source.naturalHeight;

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(source, 0, 0);

        const badgeWidth = 180 * scale;
        const badgeHeight = 36 * scale;
        const padding = 16 * scale;
        const borderRadius = badgeHeight / 2;

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

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
        ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
        ctx.lineWidth = 2 * scale;

        ctx.beginPath();
        ctx.moveTo(x + borderRadius, y);
        ctx.lineTo(x + badgeWidth - borderRadius, y);
        ctx.arcTo(
          x + badgeWidth,
          y,
          x + badgeWidth,
          y + borderRadius,
          borderRadius,
        );
        ctx.lineTo(x + badgeWidth, y + badgeHeight - borderRadius);
        ctx.arcTo(
          x + badgeWidth,
          y + badgeHeight,
          x + badgeWidth - borderRadius,
          y + badgeHeight,
          borderRadius,
        );
        ctx.lineTo(x + borderRadius, y + badgeHeight);
        ctx.arcTo(
          x,
          y + badgeHeight,
          x,
          y + badgeHeight - borderRadius,
          borderRadius,
        );
        ctx.lineTo(x, y + borderRadius);
        ctx.arcTo(x, y, x + borderRadius, y, borderRadius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const iconSize = 20 * scale;
        const iconX = x + 12 * scale;
        const iconY = y + (badgeHeight - iconSize) / 2;

        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(iconX + iconSize / 2, iconY);
        ctx.lineTo(iconX + iconSize, iconY + iconSize * 0.2);
        ctx.lineTo(iconX + iconSize, iconY + iconSize * 0.6);
        ctx.quadraticCurveTo(
          iconX + iconSize,
          iconY + iconSize,
          iconX + iconSize / 2,
          iconY + iconSize,
        );
        ctx.quadraticCurveTo(
          iconX,
          iconY + iconSize,
          iconX,
          iconY + iconSize * 0.6,
        );
        ctx.lineTo(iconX, iconY + iconSize * 0.2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 * scale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(iconX + iconSize * 0.3, iconY + iconSize * 0.5);
        ctx.lineTo(iconX + iconSize * 0.45, iconY + iconSize * 0.65);
        ctx.lineTo(iconX + iconSize * 0.7, iconY + iconSize * 0.35);
        ctx.stroke();

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
