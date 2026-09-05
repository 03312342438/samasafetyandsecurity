/** Generate the next `PREFIX-YYYY-NNNN` reference for a table/column. */
export async function nextSequence(
  supabase: any,
  table: string,
  column: string,
  prefix: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const { data } = await supabase
    .from(table)
    .select(column)
    .like(column, like)
    .order(column, { ascending: false })
    .limit(1);
  const last = (data ?? [])[0]?.[column] as string | undefined;
  const lastNum = last ? parseInt(last.split("-").pop() ?? "0", 10) : 0;
  const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
}
