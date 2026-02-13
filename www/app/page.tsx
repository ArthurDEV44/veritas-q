import TabSwitcher from "@/components/TabSwitcher";
import TabContent from "@/components/TabContent";

export default function Home() {
  const scanContent = <TabContent type="scan" />;
  const checkContent = <TabContent type="check" />;

  return <TabSwitcher scanContent={scanContent} checkContent={checkContent} />;
}
