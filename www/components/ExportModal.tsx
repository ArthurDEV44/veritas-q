'use client';

import { useState } from 'react';
import {
  Download,
  FileJson,
  FileCode2,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, Radio } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

export type ExportFormat = 'json' | 'c2pa';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sealId: string;
  onExport: (format: ExportFormat) => Promise<void>;
  trigger?: React.ReactNode;
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
  open,
  onOpenChange,
  sealId,
  onExport,
  trigger,
}: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [exportedFormat, setExportedFormat] = useState<ExportFormat | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportedFormat(null);

    try {
      await onExport(selectedFormat);
      setExportedFormat(selectedFormat);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isExporting) {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setExportedFormat(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger render={trigger as React.ReactElement} />}
      <DialogPopup showCloseButton={!isExporting}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Download className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Exporter le Seal</DialogTitle>
              <DialogDescription className="font-mono">
                {sealId.slice(0, 8)}...
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogPanel>
          <p className="mb-4 text-sm text-muted-foreground">
            Choisissez le format d&apos;export pour votre seal authentifie :
          </p>

          <RadioGroup
            value={selectedFormat}
            onValueChange={(val) => setSelectedFormat(val as ExportFormat)}
            className="gap-3"
          >
            {formatOptions.map((format) => {
              const Icon = format.icon;
              const isSelected = selectedFormat === format.id;
              const isExported = exportedFormat === format.id;

              return (
                <Label
                  key={format.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-data-[checked]:border-primary has-data-[checked]:bg-primary/5 hover:bg-accent/50"
                >
                  <Radio value={format.id} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon
                        className={`size-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                      />
                      <span className="font-medium">{format.title}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {format.extension}
                      </span>
                      {isExported && (
                        <span className="flex items-center gap-1 text-success">
                          <Check className="size-3.5" />
                          <span className="text-xs">Telecharge</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {format.description}
                    </p>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>
        </DialogPanel>

        <DialogFooter>
          <div className="flex w-full items-start gap-2 text-xs text-muted-foreground sm:flex-1">
            <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
            <p>
              Le format C2PA est compatible avec{' '}
              <a
                href="https://contentcredentials.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Content Credentials
              </a>{' '}
              (Adobe, Microsoft, BBC).
            </p>
          </div>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="ghost" />}>
              Fermer
            </DialogClose>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Spinner className="size-4" />
                  Export...
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  Telecharger
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
