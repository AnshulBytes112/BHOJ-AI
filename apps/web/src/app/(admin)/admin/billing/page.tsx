'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RoleGuard } from '@/components/auth/role-guard';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { Printer } from 'lucide-react';

type CatalogItem = {
  id: number;
  name: string;
  category: string;
  selling_price: string;
  is_active: boolean;
};

type GstConfig = {
  id: number;
  category: string;
  gst_percentage: string;
};

type BillDraftLine = {
  item_id: number;
  item_name: string;
  category: string;
  quantity: number;
  unit_price: number;
};

type CreatedBill = {
  bill: {
    id: number;
    bill_serial_number: number;
    subtotal: string;
    gst_total: string;
    grand_total: string;
    status: 'draft' | 'completed' | 'printed';
    created_at: string;
  };
  items: Array<{
    id: number;
    item_id: number;
    item_name: string;
    quantity: number;
    unit_price: string;
    gst_rate: string;
    gst_amount: string;
    line_total: string;
  }>;
};

function money(value: number): string {
  return `Rs ${value.toFixed(2)}`;
}

export default function BillingPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [gstMap, setGstMap] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [billLines, setBillLines] = useState<BillDraftLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdBill, setCreatedBill] = useState<CreatedBill | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receiptLayout, setReceiptLayout] = useState<any>(null);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return items;
    }

    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term)
      );
    });
  }, [items, searchTerm]);

  const billPreview = useMemo(() => {
    const lines = billLines.map((line) => {
      const gstRate = gstMap[line.category.toLowerCase()] ?? 0;
      const base = line.unit_price * line.quantity;
      const gstAmount = (base * gstRate) / 100;
      const lineTotal = base + gstAmount;

      return {
        ...line,
        gst_rate: gstRate,
        gst_amount: gstAmount,
        line_total: lineTotal,
      };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
    const gstTotal = lines.reduce((sum, line) => sum + line.gst_amount, 0);
    const grandTotal = subtotal + gstTotal;

    return {
      lines,
      subtotal,
      gstTotal,
      grandTotal,
    };
  }, [billLines, gstMap]);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [itemResponse, gstResponse] = await Promise.all([
        apiClient.get<CatalogItem[]>('/items', { params: { is_active: 'true' } }),
        apiClient.get<GstConfig[]>('/gst-config'),
      ]);

      const activeItems = (itemResponse.data ?? []).filter((item) => item.is_active);
      setItems(activeItems);

      const nextGstMap: Record<string, number> = {};
      for (const row of gstResponse.data ?? []) {
        nextGstMap[row.category.toLowerCase()] = Number(row.gst_percentage);
      }
      setGstMap(nextGstMap);

      // Load receipt layout
      try {
        const layoutResp = await apiClient.get('/receipt-layout');
        setReceiptLayout(layoutResp.data);
      } catch (e) {
        console.error('Failed to load receipt layout', e);
      }
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to load billing data.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function addItemToBill(item: CatalogItem) {
    setSuccessMessage(null);
    setCreatedBill(null);

    setBillLines((prev) => {
      const existing = prev.find((line) => line.item_id === item.id);
      if (existing) {
        return prev.map((line) =>
          line.item_id === item.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      return [
        ...prev,
        {
          item_id: item.id,
          item_name: item.name,
          category: item.category,
          quantity: 1,
          unit_price: Number(item.selling_price),
        },
      ];
    });
  }

  function updateLineQuantity(itemId: number, nextQuantity: number) {
    if (!Number.isInteger(nextQuantity) || nextQuantity <= 0) {
      return;
    }

    setBillLines((prev) =>
      prev.map((line) =>
        line.item_id === itemId ? { ...line, quantity: nextQuantity } : line
      )
    );
  }

  function incrementLine(itemId: number) {
    setBillLines((prev) =>
      prev.map((line) =>
        line.item_id === itemId ? { ...line, quantity: line.quantity + 1 } : line
      )
    );
  }

  function decrementLine(itemId: number) {
    setBillLines((prev) =>
      prev
        .map((line) =>
          line.item_id === itemId ? { ...line, quantity: line.quantity - 1 } : line
        )
        .filter((line) => line.quantity > 0)
    );
  }

  function removeLine(itemId: number) {
    setBillLines((prev) => prev.filter((line) => line.item_id !== itemId));
  }

  async function generateBill() {
    if (billLines.length === 0) {
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await apiClient.post<CreatedBill>('/bills', {
        cashier_id: 1,
        items: billLines.map((line) => ({ item_id: line.item_id, quantity: line.quantity })),
      });

      const payload = response.data;
      setCreatedBill(payload);
      setSuccessMessage(`Bill generated successfully. Bill No: ${payload.bill.bill_serial_number}`);
      setBillLines([]);
      setSearchTerm('');
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to generate bill.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function printCreatedBill() {
    if (!createdBill) {
      return;
    }

    try {
      await apiClient.post(`/bills/${createdBill.bill.id}/print`);

      const layout = receiptLayout || {
        header_text: 'RestroManager Hotel',
        footer_text: 'Thank you for visiting!',
        logo_url: null,
        show_gst_breakdown: true
      };

      const data: ReceiptData = {
        bill_serial_number: createdBill.bill.bill_serial_number,
        created_at: createdBill.bill.created_at,
        header_text: layout.header_text,
        footer_text: layout.footer_text,
        logo_url: layout.logo_url,
        show_gst_breakdown: layout.show_gst_breakdown,
        items: createdBill.items.map((item) => ({
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_rate: item.gst_rate,
          gst_amount: item.gst_amount,
          line_total: (Number(item.unit_price) * item.quantity).toString(), // Subtotal without GST
        })),
        subtotal: createdBill.bill.subtotal,
        gst_total: createdBill.bill.gst_total,
        grand_total: createdBill.bill.grand_total,
      };

      setReceiptData(data);
      setIsReceiptOpen(true);
      setSuccessMessage(`Bill ${createdBill.bill.bill_serial_number} marked as printed.`);

      setCreatedBill((prev) =>
        prev
          ? {
            ...prev,
            bill: {
              ...prev.bill,
              status: 'printed',
            },
          }
          : prev
      );
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to print bill.');
    }
  }

  // Effect to trigger print when receipt data is loaded and dialog is open
  useEffect(() => {
    if (isReceiptOpen && receiptData) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isReceiptOpen, receiptData]);

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Billing</h1>
            <p className="text-sm text-muted-foreground">
              Create bills from active catalog items. Final totals are always calculated on server.
            </p>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-2 border bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Item Selector</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or category"
                />

                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading items...</p>
                  ) : filteredItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active items found.</p>
                  ) : (
                    filteredItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addItemToBill(item)}
                        className="w-full rounded-xl border bg-white px-3 py-2 text-left transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.category}</p>
                          </div>
                          <p className="text-sm font-semibold text-foreground">{money(Number(item.selling_price))}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-3 border bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Current Bill</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="w-[180px]">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">GST%</TableHead>
                      <TableHead className="text-right">GST Amt</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billPreview.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                          Bill is empty.
                        </TableCell>
                      </TableRow>
                    ) : (
                      billPreview.lines.map((line) => (
                        <TableRow key={line.item_id}>
                          <TableCell>
                            <p className="font-medium">{line.item_name}</p>
                            <p className="text-xs text-muted-foreground">{line.category}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => decrementLine(line.item_id)}>
                                -
                              </Button>
                              <Input
                                value={line.quantity}
                                onChange={(e) => updateLineQuantity(line.item_id, Number(e.target.value))}
                                type="number"
                                min="1"
                                step="1"
                                className="h-8 w-16 text-center"
                              />
                              <Button type="button" size="sm" variant="outline" onClick={() => incrementLine(line.item_id)}>
                                +
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{money(line.unit_price)}</TableCell>
                          <TableCell className="text-right">{line.gst_rate.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{money(line.gst_amount)}</TableCell>
                          <TableCell className="text-right">{money(line.line_total)}</TableCell>
                          <TableCell className="text-right">
                            <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(line.item_id)}>
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{money(billPreview.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST Total</span>
                    <span className="font-medium">{money(billPreview.gstTotal)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-semibold">
                    <span>Grand Total</span>
                    <span>{money(billPreview.grandTotal)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={generateBill}
                    disabled={billPreview.lines.length === 0 || isGenerating}
                    className="rounded-xl"
                  >
                    {isGenerating ? 'Generating...' : 'Generate Bill'}
                  </Button>

                  {createdBill && (
                    <>
                      <Badge variant="secondary">Bill No: {createdBill.bill.bill_serial_number}</Badge>
                      <Badge variant="outline" className="capitalize">
                        {createdBill.bill.status}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={printCreatedBill}
                        disabled={createdBill.bill.status === 'printed'}
                      >
                        {createdBill.bill.status === 'printed' ? 'Printed' : 'Print'}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

      </DashboardLayout>

      {isReceiptOpen && receiptData && (
        <div className="fixed inset-0 z-[100] bg-white flex items-start justify-center overflow-auto p-4 md:p-10 no-print-background">
          <div className="no-print absolute top-4 right-4 flex gap-2">
            <Button onClick={() => window.print()}>Print Again</Button>
            <Button variant="outline" onClick={() => setIsReceiptOpen(false)}>
              Close Preview
            </Button>
          </div>
          <div className="print:block">
            <ReceiptPrint data={receiptData} />
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
