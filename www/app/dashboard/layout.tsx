import { QueryProvider } from "@/components/providers/QueryProvider";
import UserSyncProvider from "@/components/UserSyncProvider";
import {
  DashboardSidebar,
  DashboardBottomNav,
} from "@/components/DashboardNav";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <UserSyncProvider>
        {/* Negative margins escape root layout padding for full-bleed sidebar */}
        <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-4 sm:-my-6 lg:-my-8">
          <div className="flex min-h-[calc(100svh-3.5rem)] sm:min-h-[calc(100svh-4rem)]">
            <DashboardSidebar />
            <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-md:pb-20">
              {children}
            </div>
          </div>
          <DashboardBottomNav />
        </div>
      </UserSyncProvider>
    </QueryProvider>
  );
}
