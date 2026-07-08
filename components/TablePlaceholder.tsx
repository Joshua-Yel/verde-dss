export default function TablePlaceholder() {
  return (
    <div className="rounded border bg-white p-4">
      <table className="w-full text-sm">
        <thead className="text-zinc-600">
          <tr>
            <th className="text-left py-2">Service</th>
            <th className="text-left py-2">Category</th>
            <th className="text-right py-2">Jan</th>
            <th className="text-right py-2">Feb</th>
            <th className="text-right py-2">Mar</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="py-2">Signature Balayage</td>
            <td className="py-2">Hair</td>
            <td className="py-2 text-right">62</td>
            <td className="py-2 text-right">58</td>
            <td className="py-2 text-right">74</td>
          </tr>
          <tr className="border-t">
            <td className="py-2">Precision Cut & Style</td>
            <td className="py-2">Hair</td>
            <td className="py-2 text-right">148</td>
            <td className="py-2 text-right">132</td>
            <td className="py-2 text-right">165</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
