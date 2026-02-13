import { QueryProvider } from "@/components/providers/QueryProvider";
import UserSyncProvider from "@/components/UserSyncProvider";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <UserSyncProvider>{children}</UserSyncProvider>
    </QueryProvider>
  );
}
