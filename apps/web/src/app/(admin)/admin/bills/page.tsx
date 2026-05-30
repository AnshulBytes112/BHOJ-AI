'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RoleGuard } from '@/components/auth/role-guard';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import apiClient from '@/services/apiClient';
import { ReceiptData, ReceiptPrint } from '@/components/admin/receipt-print';
import { formatDate } from '@/lib/utils';
import { PageContainer } from '@/components/common/page-container';
import { ResponsiveTable } from '@/components/common/responsive-table';

type BillStatus = 'draft' | 'completed' | 'printed';

type BillListItem = {
  id: number;
  bill_serial_number: number;
  cashier_id: number;
  subtotal: string;
  gst_total: string;
  grand_total: string;
  status: BillStatus;
  created_at: string;
  items_count: number;
};

type BillDetail = {
  bill: {
    id: number;
    bill_serial_number: number;
    cashier_id: number;
    subtotal: string;
    gst_total: string;
    grand_total: string;
    status: BillStatus;
    created_at: string;
  };
  items: Array<{
    id: number;
    bill_id: number;
    item_id: number;
    item_name: string;
    quantity: number;
    unit_price: string;
    gst_rate: string;
    gst_amount: string;
    line_total: string;
  }>;
};

function statusVariant(status: BillStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'printed') {
    return 'default';
  }
  if (status === 'completed') {
    return 'secondary';
  }
  return 'outline';
}

export default function BillsHistoryPage() {
  const [bills, setBills] = useState<BillListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<BillDetail | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);

  const [isPrinting, setIsPrinting] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const columns = [
    {
      header: 'Bill No',
      accessor: (row: BillListItem) => row.bill_serial_number,
    },
    {
      header: 'Date',
      accessor: (row: BillListItem) => formatDate(row.created_at),
    },
    {
      header: 'Items Count',
      accessor: (row: BillListItem) => row.items_count,
      className: 'text-right',
    },
    {
      header: 'Subtotal',
      accessor: (row: BillListItem) => `Rs ${Number(row.subtotal).toFixed(2)}`,
      className: 'text-right',
    },
    {
      header: 'GST',
      accessor: (row: BillListItem) => `Rs ${Number(row.gst_total).toFixed(2)}`,
      className: 'text-right',
    },
    {
      header: 'Grand Total',
      accessor: (row: BillListItem) => `Rs ${Number(row.grand_total).toFixed(2)}`,
      className: 'text-right font-bold',
    },
    {
      header: 'Status',
      accessor: (row: BillListItem) => (
        <Badge variant={statusVariant(row.status)} className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    {
      header: 'Action',
      accessor: (row: BillListItem) => (
        <div className="inline-flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => handleViewBill(row.id)} className="h-10 px-3">
            View
          </Button>
          <Button
            size="sm"
            onClick={() => handlePrintBill(row.id)}
            disabled={isPrinting || row.status === 'draft'}
            className="h-10 px-3 bg-blue-600 hover:bg-blue-700 text-white"
          >
            Print
          </Button>
        </div>
      ),
      className: 'text-right',
    },
  ];

  const mobileCardRender = (bill: BillListItem) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center border-b pb-2">
        <span className="font-bold text-gray-800 text-sm">Bill #{bill.bill_serial_number}</span>
        <Badge variant={statusVariant(bill.status)} className="capitalize">
          {bill.status}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Date</span>
          <span className="font-medium">{formatDate(bill.created_at)}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Items Count</span>
          <span className="font-medium">{bill.items_count} items</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Subtotal</span>
          <span className="font-medium">Rs {Number(bill.subtotal).toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">GST</span>
          <span className="font-medium">Rs {Number(bill.gst_total).toFixed(2)}</span>
        </div>
      </div>
      <div className="flex justify-between items-center border-t pt-2 mt-2">
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Grand Total</span>
          <span className="text-sm font-bold text-blue-600">Rs {Number(bill.grand_total).toFixed(2)}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleViewBill(bill.id)} className="h-10 px-3">
            View
          </Button>
          <Button
            size="sm"
            onClick={() => handlePrintBill(bill.id)}
            disabled={isPrinting || bill.status === 'draft'}
            className="h-10 px-3 bg-blue-600 hover:bg-blue-700 text-white"
          >
            Print
          </Button>
        </div>
      </div>
    </div>
  );

  const detailColumns = [
    {
      header: 'Item',
      accessor: (row: any) => row.item_name,
    },
    {
      header: 'Qty',
      accessor: (row: any) => row.quantity,
      className: 'text-right',
    },
    {
      header: 'Unit Price',
      accessor: (row: any) => `Rs ${Number(row.unit_price).toFixed(2)}`,
      className: 'text-right',
    },
    {
      header: 'GST%',
      accessor: (row: any) => `${Number(row.gst_rate).toFixed(2)}%`,
      className: 'text-right',
    },
    {
      header: 'GST Amt',
      accessor: (row: any) => `Rs ${Number(row.gst_amount).toFixed(2)}`,
      className: 'text-right',
    },
    {
      header: 'Line Total',
      accessor: (row: any) => `Rs ${Number(row.line_total).toFixed(2)}`,
      className: 'text-right font-bold',
    },
  ];

  const detailMobileCardRender = (line: any) => (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between items-center border-b pb-1 font-semibold">
        <span>{line.item_name}</span>
        <span>Qty: {line.quantity}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 pt-1 text-gray-500">
        <div>Unit Price: Rs {Number(line.unit_price).toFixed(2)}</div>
        <div className="text-right">GST: {Number(line.gst_rate).toFixed(2)}% (Rs {Number(line.gst_amount).toFixed(2)})</div>
      </div>
      <div className="flex justify-between items-center font-bold text-slate-700 pt-1">
        <span>Line Total</span>
        <span>Rs {Number(line.line_total).toFixed(2)}</span>
      </div>
    </div>
  );

  const grandTotalOfAll = useMemo(() => {
    return bills.reduce((sum, bill) => sum + Number(bill.grand_total), 0);
  }, [bills]);

  async function loadBills() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiClient.get<BillListItem[]>('/bills');
      setBills(response.data ?? []);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to load bills.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadBills();
  }, []);

  async function handleViewBill(billId: number) {
    setErrorMessage(null);

    try {
      const response = await apiClient.get<BillDetail>(`/bills/${billId}`);
      setSelectedBill(response.data);
      setSelectedBillId(billId);
      setIsDetailOpen(true);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to load bill details.');
    }
  }

  async function handlePrintBill(billId: number) {
    setIsPrinting(true);
    setErrorMessage(null);

    try {
      // 1. Mark as printed in DB
      await apiClient.post(`/bills/${billId}/print`);
      
      // 2. Fetch structured receipt data
      const response = await apiClient.get<ReceiptData>(`/bills/${billId}/receipt`);
      setReceiptData(response.data);
      setIsReceiptOpen(true);
      
      // 3. Reload list
      await loadBills();
      if (selectedBillId === billId) {
        await handleViewBill(billId);
      }
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to print bill.');
    } finally {
      setIsPrinting(false);
    }
  }

  // Effect to trigger print when receipt data is loaded and dialog is open
  useEffect(() => {
    if (isReceiptOpen && receiptData) {
      // Use a slightly longer delay to ensure all images/fonts are loaded
      const timer = setTimeout(() => {
        window.print();
        // After printing starts, we can hide the receipt view
        // But we'll leave it for a moment so the user sees it
        // setTimeout(() => setIsReceiptOpen(false), 2000);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isReceiptOpen, receiptData]);

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin']}>
      <DashboardLayout>
        <PageContainer className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Bills History</h1>
              <p className="text-sm text-muted-foreground">
                View finalized bills, inspect line-level snapshots, and print receipts.
              </p>
            </div>
            <div className="rounded-xl border bg-white px-4 py-3 text-right shadow-sm">
              <p className="text-xs text-muted-foreground">Total Collection (Visible Rows)</p>
              <p className="text-lg font-semibold">Rs {grandTotalOfAll.toFixed(2)}</p>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <Card className="border bg-white shadow-sm">
            <CardHeader>
              <CardTitle>All Bills</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveTable
                data={bills}
                columns={columns}
                rowKey={(row) => row.id}
                mobileCardRender={mobileCardRender}
                loading={isLoading}
              />
            </CardContent>
          </Card>

          <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>
                  Bill Detail{selectedBill ? ` - #${selectedBill.bill.bill_serial_number}` : ''}
                </DialogTitle>
                <DialogDescription>
                  Receipt data is shown from bill item snapshots saved at billing time.
                </DialogDescription>
              </DialogHeader>

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

              <DialogFooter>
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
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </PageContainer>
      </DashboardLayout>

      {isReceiptOpen && receiptData && (
        <div className="fixed inset-0 z-[100] bg-white flex items-start justify-center overflow-auto p-4 md:p-10 no-print-background">
          <div className="no-print absolute top-4 right-4 flex gap-2">
            <Button onClick={() => window.print()}>Print Again</Button>
            <Button variant="outline" onClick={() => setIsReceiptOpen(false)}>Close Preview</Button>
          </div>
          <div className="print:block">
            <ReceiptPrint data={receiptData} />
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
