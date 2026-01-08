import UserSyncProvider from "@/components/UserSyncProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <UserSyncProvider>{children}</UserSyncProvider>;
}
