import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function SmallTable({ columns, rows }: { columns: string[]; rows: any[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map(c => (
            <TableHead key={c}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {columns.map((c, j) => (
              <TableCell key={j} className={typeof r[c] === 'number' ? 'text-right' : ''}>
                {r[c] ?? '-'}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
