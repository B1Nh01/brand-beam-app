import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StrategyTab } from "./strategy-tab";
import { FilesTab } from "./files-tab";

type Props = { clientId: string; workspaceId: string };

export function BrandCore({ clientId, workspaceId }: Props) {
  return (
    <Tabs defaultValue="strategy" className="mt-2">
      <TabsList>
        <TabsTrigger value="strategy">Estratégia</TabsTrigger>
        <TabsTrigger value="files">Arquivos</TabsTrigger>
      </TabsList>
      <TabsContent value="strategy" className="pt-4">
        <StrategyTab clientId={clientId} workspaceId={workspaceId} />
      </TabsContent>
      <TabsContent value="files" className="pt-4">
        <FilesTab clientId={clientId} workspaceId={workspaceId} />
      </TabsContent>
    </Tabs>
  );
}
