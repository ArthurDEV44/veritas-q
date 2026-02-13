'use client';

import { useState } from 'react';
import {
  X,
  Download,
  FileJson,
  FileCode2,
  Check,
  Loader2,
  ExternalLink,
} from 'lucide-react';

export type ExportFormat = 'json' | 'c2pa';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sealId: string;
  onExport: (format: ExportFormat) => Promise<void>;
}

const formatOptions: {
  id: ExportFormat;
  icon: typeof FileJson;
  title: string;
  description: string;
  extension: string;
}[] = [
  {
    id: 'json',
    icon: FileJson,
    title: 'JSON',
    description: 'Toutes les metadonnees du seal dans un format lisible',
    extension: '.json',
  },
  {
    id: 'c2pa',
    icon: FileCode2,
    title: 'C2PA JUMBF',
    description: 'Format standard compatible Adobe/Microsoft Content Credentials',
    extension: '.json',
  },
];

export default function ExportModal({
  isOpen,
  onClose,
  sealId,
  onExport,
}: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedFormat, setExportedFormat] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setSelectedFormat(format);
    setIsExporting(true);
    setExportedFormat(null);

    try {
      await onExport(format);
      setExportedFormat(format);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      setSelectedFormat(null);
      setExportedFormat(null);
      onClose();
    }
  };

  return (
    <>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="animate-[fadeIn_0.3s_ease-out] fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="animate-[scaleIn_0.3s_ease-out] fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface-elevated rounded-2xl border border-border shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-quantum/10 rounded-lg">
                  <Download className="w-5 h-5 text-quantum" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Exporter le Seal
                  </h2>
                  <p className="text-xs text-foreground/60 font-mono">
                    {sealId.slice(0, 8)}...
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isExporting}
                className="p-2 rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5 text-foreground/60" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <p className="text-sm text-foreground/70">
                Choisissez le format d&apos;export pour votre seal authentifie:
              </p>

              {formatOptions.map((format) => {
                const Icon = format.icon;
                const isSelected = selectedFormat === format.id;
                const isExported = exportedFormat === format.id;
                const isLoading = isSelected && isExporting;

                return (
                  <button
                    key={format.id}
                    onClick={() => handleExport(format.id)}
                    disabled={isExporting}
                    className={`
                      w-full p-4 rounded-xl border transition-all text-left
                      ${isSelected
                        ? 'border-quantum bg-quantum/5'
                        : 'border-border hover:border-foreground/30 hover:bg-surface'
                      }
                      ${isExporting && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`
                          p-2 rounded-lg transition-colors
                          ${isSelected ? 'bg-quantum/20' : 'bg-surface'}
                        `}
                      >
                        <Icon
                          className={`w-5 h-5 ${isSelected ? 'text-quantum' : 'text-foreground/60'}`}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3
                            className={`font-medium ${isSelected ? 'text-quantum' : 'text-foreground'}`}
                          >
                            {format.title}
                          </h3>
                          <span className="text-xs text-foreground/40 font-mono">
                            {format.extension}
                          </span>
                          {isLoading && (
                            <Loader2 className="w-4 h-4 text-quantum animate-spin" />
                          )}
                          {isExported && (
                            <div className="flex items-center gap-1 text-green-500">
                              <Check className="w-4 h-4" />
                              <span className="text-xs">Telecharge</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-foreground/60 mt-0.5">
                          {format.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border bg-surface/50">
              <div className="flex items-start gap-2 text-xs text-foreground/50">
                <ExternalLink className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Le format C2PA est compatible avec{' '}
                  <a
                    href="https://contentcredentials.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-quantum hover:underline"
                  >
                    Content Credentials
                  </a>{' '}
                  (Adobe, Microsoft, BBC).
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
