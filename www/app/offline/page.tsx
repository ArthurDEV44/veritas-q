'use client';

import { WifiOff, RefreshCw, Shield, Eye, Database } from 'lucide-react';
import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardPanel } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export default function OfflinePage() {
  return (
    <Empty className="min-h-[70vh]">
      <EmptyMedia variant="icon">
        <WifiOff className="size-5" />
      </EmptyMedia>

      <EmptyHeader>
        <EmptyTitle>Hors connexion</EmptyTitle>
        <EmptyDescription>
          La connexion internet est requise pour acceder aux sources
          d&apos;entropie quantique et creer des sceaux authentifies.
        </EmptyDescription>
      </EmptyHeader>

      <EmptyContent>
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4 text-primary" />
              Pourquoi cette limitation ?
            </CardTitle>
          </CardHeader>
          <CardPanel>
            <p className="text-sm text-muted-foreground">
              Les sceaux Veritas Q utilisent l&apos;entropie de generateurs
              quantiques (QRNG) pour garantir l&apos;authenticite. Cette source
              d&apos;aleatoire quantique necessite une connexion aux serveurs QRNG.
            </p>
          </CardPanel>
        </Card>

        <Alert variant="info" className="w-full">
          <Eye className="size-4" />
          <AlertTitle>Disponible hors ligne</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-success shrink-0" />
                Consulter l&apos;interface
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-success shrink-0" />
                Voir les sceaux en cache
              </li>
              <li className="flex items-center gap-2">
                <Database className="size-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Creer de nouveaux sceaux</span>
              </li>
              <li className="flex items-center gap-2">
                <Database className="size-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Verifier des medias</span>
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        <Button
          onClick={() => window.location.reload()}
          className="gap-2"
        >
          <RefreshCw className="size-4" />
          Reessayer la connexion
        </Button>
      </EmptyContent>
    </Empty>
  );
}
