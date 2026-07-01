const fs = require('fs');
const filePath = 'apps/web/src/app/(admin)/admin/bills/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace imports
content = content.replace(
  /import {\s*Dialog,\s*DialogContent,\s*DialogDescription,\s*DialogFooter,\s*DialogHeader,\s*DialogTitle,\s*} from '@\/components\/ui\/dialog';/,
  "import { ResponsiveDialog } from '@/components/common/responsive-dialog';"
);

// Replace the Dialog section
const dialogRegex = /<Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>[\s\S]*?<\/Dialog>/;

const newDialog = `<ResponsiveDialog
            isOpen={isDetailOpen}
            onOpenChange={setIsDetailOpen}
            title={\`Bill Detail\${selectedBill ? \` - #\${selectedBill.bill.bill_serial_number}\` : ''}\`}
            description="Receipt data is shown from bill item snapshots saved at billing time."
            className="max-w-4xl"
            footer={
              <div className="flex gap-2 justify-end w-full">
                {selectedBill && selectedBill.bill.status !== 'draft' && (
                  <Button
                    onClick={() => handlePrintBill(selectedBill.bill.id)}
                    disabled={isPrinting}
                  >
                    {isPrinting ? 'Printing...' : 'Print'}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                  Close
                </Button>
              </div>
            }
          >
            {selectedBill ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">Bill No</p>
                    <p className="font-medium">{selectedBill.bill.bill_serial_number}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cashier ID</p>
                    <p className="font-medium">{selectedBill.bill.cashier_id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-medium">{formatDate(selectedBill.bill.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant={statusVariant(selectedBill.bill.status)} className="capitalize">
                      {selectedBill.bill.status}
                    </Badge>
                  </div>
                </div>

                <ResponsiveTable
                  data={selectedBill.items}
                  columns={detailColumns}
                  rowKey={(row) => row.id}
                  mobileCardRender={detailMobileCardRender}
                />

                <div className="ml-auto w-full max-w-sm space-y-1 rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>Rs {Number(selectedBill.bill.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST Total</span>
                    <span>Rs {Number(selectedBill.bill.gst_total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Grand Total</span>
                    <span>Rs {Number(selectedBill.bill.grand_total).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No bill selected.</p>
            )}
          </ResponsiveDialog>`;

content = content.replace(dialogRegex, newDialog);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Bills page updated!');
