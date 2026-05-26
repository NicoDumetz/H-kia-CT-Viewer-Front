import {
  Badge,
  Button,
  Card,
  EmptyState,
  Panel,
  StatusDot,
  Toolbar,
} from "../../components";

export default function Home() {
  return (
    <main className="min-h-screen bg-background p-6 text-white">
      <Panel
        actions={<Badge variant="ai">IA</Badge>}
        subtitle="Base UI sombre pour viewer CT, segmentation et analyse HU."
        title="Hekia CT Viewer"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card
            description="Les composants de base sont disponibles pour construire les futurs ecrans."
            title="Viewer"
          >
            <EmptyState
              action={<Button variant="primary">Importer une serie</Button>}
              description="Aucun viewer Cornerstone ni appel API n'est encore branche."
              title="Aucune serie chargee"
            />
          </Card>

          <Card title="Analyse">
            <div className="space-y-3">
              <StatusDot label="Segmentation en attente" status="idle" />
              <StatusDot label="Pipeline IA disponible" status="success" />
              <Toolbar>
                <Button size="sm" variant="soft">
                  HU
                </Button>
                <Button size="sm" variant="ghost">
                  ROI
                </Button>
              </Toolbar>
            </div>
          </Card>
        </div>
      </Panel>
    </main>
  );
}
