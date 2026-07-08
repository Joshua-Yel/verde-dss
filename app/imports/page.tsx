import supabaseServer from "../../src/lib/supabaseServer";
import Card from "../../components/Card";
import ReprocessImport from "../../components/ReprocessImport";

function Preview({ data }: { data: any }) {
  try {
    const json = JSON.stringify(data, null, 2);
    return (
      <pre className="text-xs max-h-56 overflow-auto p-2 bg-zinc-50 rounded">
        {json}
      </pre>
    );
  } catch {
    return <div className="text-xs">(unavailable preview)</div>;
  }
}

export default async function ImportsPage() {
  const { data, error } = await supabaseServer
    .from("raw_imports")
    .select("id, filename, data, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error)
    return (
      <div className="p-6">
        Error loading imports: {error.message}
      </div>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Import Audit</h1>

      <div className="grid gap-4">
        {data?.length ? (
          data.map((row: any) => (
            <Card key={row.id} title={row.filename || "Import"}>
              <div className="text-sm text-zinc-600 mb-2">
                Imported at: {new Date(row.created_at).toLocaleString()}
              </div>

              <div className="text-sm">
                Rows: {Array.isArray(row.data) ? row.data.length : "-"}
              </div>

              <div className="mt-3">
                <Preview
                  data={
                    Array.isArray(row.data)
                      ? row.data.slice(0, 5)
                      : row.data
                  }
                />
              </div>

              <div className="mt-4">
                <ReprocessImport id={row.id} />
              </div>
            </Card>
          ))
        ) : (
          <div className="rounded border bg-white p-4">
            No imports found.
          </div>
        )}
      </div>
    </div>
  );
}