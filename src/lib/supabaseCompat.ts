type SupabaseMutationResult = {
  error?: { message?: string | null } | null;
};

type SupabaseInsertClient = {
  from: (table: string) => {
    insert: (rows: Array<Record<string, unknown>>) => Promise<SupabaseMutationResult>;
  };
};

function isMissingBusinessIdColumnError(error: { message?: string | null } | null | undefined) {
  const message = (error?.message ?? '').toLowerCase();
  return message.includes('column') && message.includes('business_id') && message.includes('does not exist');
}

export async function insertWithBusinessIdFallback(
  client: SupabaseInsertClient,
  table: string,
  rows: Array<Record<string, unknown>>,
  businessId: string | null | undefined,
) {
  if (!businessId) {
    return client.from(table).insert(rows);
  }

  const rowsWithBusinessId = rows.map((row) => ({ ...row, business_id: businessId }));
  const firstResult = await client.from(table).insert(rowsWithBusinessId);

  if (!firstResult.error || !isMissingBusinessIdColumnError(firstResult.error)) {
    return firstResult;
  }

  const rowsWithoutBusinessId = rows.map((row) => {
    const { business_id, ...rest } = row;
    void business_id;
    return rest;
  });

  return client.from(table).insert(rowsWithoutBusinessId);
}
