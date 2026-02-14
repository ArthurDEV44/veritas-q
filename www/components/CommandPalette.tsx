"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import {
  Camera,
  Download,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Plus,
  Settings,
  ShieldCheck,
} from "lucide-react";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

interface ItemMeta {
  icon: ComponentType<{ className?: string }>;
  href: string;
}

const itemMeta: Record<string, ItemMeta> = {
  dashboard: { icon: LayoutDashboard, href: "/dashboard" },
  seals: { icon: ShieldCheck, href: "/dashboard/seals" },
  settings: { icon: Settings, href: "/dashboard/settings" },
  capturer: { icon: Camera, href: "/" },
  verifier: { icon: ShieldCheck, href: "/verify" },
  "nouveau-seal": { icon: Plus, href: "/" },
  exporter: { icon: Download, href: "/dashboard/seals" },
  documentation: { icon: FileText, href: "#" },
  support: { icon: LifeBuoy, href: "#" },
};

const commandGroups = [
  {
    value: "Navigation",
    items: [
      { value: "dashboard", label: "Dashboard" },
      { value: "seals", label: "Mes Seals" },
      { value: "settings", label: "Paramètres" },
      { value: "capturer", label: "Capturer" },
      { value: "verifier", label: "Vérifier" },
    ],
  },
  {
    value: "Actions",
    items: [
      { value: "nouveau-seal", label: "Nouveau Seal" },
      { value: "exporter", label: "Exporter" },
    ],
  },
  {
    value: "Aide",
    items: [
      { value: "documentation", label: "Documentation" },
      { value: "support", label: "Support" },
    ],
  },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    const handleToggle = () => setOpen((prev) => !prev);

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("toggle-command-palette", handleToggle);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("toggle-command-palette", handleToggle);
    };
  }, []);

  const runCommand = useCallback(
    (value: string) => {
      setOpen(false);
      const meta = itemMeta[value];
      if (meta?.href && meta.href !== "#") {
        router.push(meta.href);
      }
    },
    [router],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup>
        <Command
          items={commandGroups}
          onValueChange={(val) => {
            if (val) runCommand(String(val));
          }}
        >
          <CommandInput placeholder="Rechercher une commande..." />
          <CommandEmpty>Aucun résultat trouvé.</CommandEmpty>
          <CommandList>
            {(group: (typeof commandGroups)[number], index: number) => (
              <Fragment key={group.value}>
                <CommandGroup items={group.items}>
                  <CommandGroupLabel>{group.value}</CommandGroupLabel>
                  <CommandCollection>
                    {(item: (typeof commandGroups)[number]["items"][number]) => {
                      const meta = itemMeta[item.value];
                      const Icon = meta?.icon;
                      return (
                        <CommandItem key={item.value} value={item.value}>
                          {Icon && (
                            <Icon className="size-4 mr-2 text-muted-foreground" />
                          )}
                          {item.label}
                        </CommandItem>
                      );
                    }}
                  </CommandCollection>
                </CommandGroup>
                {index < commandGroups.length - 1 && <CommandSeparator />}
              </Fragment>
            )}
          </CommandList>
          <CommandFooter>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <KbdGroup>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                </KbdGroup>
                <span>Naviguer</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                <span>Ouvrir</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>Esc</Kbd>
                <span>Fermer</span>
              </span>
            </div>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
