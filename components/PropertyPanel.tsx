interface PropertyPanelProps {
  property: Record<string, string>
}

export function PropertyPanel({ property }: PropertyPanelProps) {
  return (
    <div className="mt-4 rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {Object.entries(property).map(([key, val], i) => (
            <tr key={key} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
              <td className="px-3 py-1.5 text-muted-foreground w-[40%]">{key}</td>
              <td className="px-3 py-1.5 text-right">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
