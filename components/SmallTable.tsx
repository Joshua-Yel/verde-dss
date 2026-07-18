import { type ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type SmallTableRow = Record<string, ReactNode>

export default function SmallTable({ columns, rows }: { columns: string[]; rows: SmallTableRow[] }) {
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
            {columns.map((c, j) => {
              const value = r[c]
              const displayValue = value === undefined || value === null ? '-' : value
              return (
                <TableCell key={j} className={typeof value === 'number' ? 'text-right' : ''}>
                  {displayValue}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
