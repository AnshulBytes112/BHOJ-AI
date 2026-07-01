const fs = require('fs');
const filePath = 'apps/web/src/app/(admin)/admin/billing/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('ResponsiveTable')) {
  content = content.replace(
    "import { Printer } from 'lucide-react';",
    "import { Printer } from 'lucide-react';\nimport { ResponsiveTable } from '@/components/common/responsive-table';"
  );
}

const tableRegex = /<Table>[\s\S]*?<\/Table>/;

const newTable = `<ResponsiveTable
                  data={billPreview.lines}
                  loading={false}
                  rowKey={(row) => row.item_id}
                  columns={[
                    {
                      header: 'Item Name',
                      accessor: (line) => (
                        <>
                          <p className="font-medium">{line.item_name}</p>
                          <p className="text-xs text-muted-foreground">{line.category}</p>
                        </>
                      )
                    },
                    {
                      header: 'Qty',
                      accessor: (line) => (
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => decrementLine(line.item_id)}>-</Button>
                          <Input
                            value={line.quantity}
                            onChange={(e) => updateLineQuantity(line.item_id, Number(e.target.value))}
                            type="number" min="1" step="1"
                            className="h-8 w-16 text-center"
                          />
                          <Button type="button" size="sm" variant="outline" onClick={() => incrementLine(line.item_id)}>+</Button>
                        </div>
                      )
                    },
                    {
                      header: 'Unit Price',
                      accessor: (line) => money(line.unit_price),
                      className: 'text-right'
                    },
                    {
                      header: 'GST%',
                      accessor: (line) => \`\${line.gst_rate.toFixed(2)}%\`,
                      className: 'text-right'
                    },
                    {
                      header: 'GST Amt',
                      accessor: (line) => money(line.gst_amount),
                      className: 'text-right'
                    },
                    {
                      header: 'Line Total',
                      accessor: (line) => money(line.line_total),
                      className: 'text-right'
                    },
                    {
                      header: 'Action',
                      accessor: (line) => (
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(line.item_id)}>Remove</Button>
                      ),
                      className: 'text-right'
                    }
                  ]}
                />`;

content = content.replace(tableRegex, newTable);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Billing page table updated!');
