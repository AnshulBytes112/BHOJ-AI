'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { RoleGuard } from '@/components/auth/role-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import apiClient from '@/services/apiClient';

type ReceiptLayout = {
  logo_url: string;
  header_text: string;
  footer_text: string;
  show_gst_breakdown: boolean;
};

export default function ReceiptLayoutPage() {
  const [layout, setLayout] = useState<ReceiptLayout>({
    logo_url: '',
    header_text: '',
    footer_text: '',
    show_gst_breakdown: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadLayout() {
    setIsLoading(true);
    try {
      const response = await apiClient.get<ReceiptLayout>('/receipt-layout');
      setLayout(response.data || {
        logo_url: '',
        header_text: 'RestroManager Hotel',
        footer_text: 'Thank you for visiting!',
        show_gst_breakdown: true,
      });
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to load receipt layout.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLayout();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiClient.put('/receipt-layout', layout);
      setSuccessMessage('Receipt layout updated successfully.');
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to update receipt layout.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Receipt Layout</h1>
            <p className="text-sm text-muted-foreground">Customize how your printed bills will look.</p>
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Layout Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="logo_url">Logo URL</Label>
                  <Input
                    id="logo_url"
                    value={layout.logo_url || ''}
                    onChange={(e) => setLayout({ ...layout, logo_url: e.target.value })}
                    placeholder="https://example.com/logo.png"
                  />
                  {layout.logo_url && (
                    <div className="mt-2 flex items-center justify-center rounded-lg border bg-muted/20 p-4">
                      <img src={layout.logo_url} alt="Logo Preview" className="max-h-20 object-contain" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="header_text">Header Text</Label>
                  <Textarea
                    id="header_text"
                    value={layout.header_text || ''}
                    onChange={(e) => setLayout({ ...layout, header_text: e.target.value })}
                    placeholder="Enter hotel name, address, contact..."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="footer_text">Footer Text</Label>
                  <Textarea
                    id="footer_text"
                    value={layout.footer_text || ''}
                    onChange={(e) => setLayout({ ...layout, footer_text: e.target.value })}
                    placeholder="Enter thank you message, terms..."
                    rows={4}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="gst_breakdown">Show GST Breakdown</Label>
                    <p className="text-xs text-muted-foreground">
                      Display a table summarizing GST per percentage slab at the bottom.
                    </p>
                  </div>
                  <Switch
                    id="gst_breakdown"
                    checked={layout.show_gst_breakdown}
                    onCheckedChange={(checked) => setLayout({ ...layout, show_gst_breakdown: checked })}
                  />
                </div>

                <Button onClick={handleSave} disabled={isSaving || isLoading} className="w-full">
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>

            <Card className="border bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Live Preview</CardTitle>
              </CardHeader>
              <CardContent className="bg-muted/30 p-8 flex justify-center">
                <div className="w-full max-w-[320px] bg-white p-6 shadow-xl border font-mono text-[10px] leading-tight space-y-4">
                  {layout.logo_url && (
                    <div className="flex justify-center mb-2">
                      <img src={layout.logo_url} alt="Receipt Logo" className="max-h-12 object-contain grayscale" />
                    </div>
                  )}
                  
                  <div className="text-center whitespace-pre-line border-b border-dashed pb-2">
                    {layout.header_text || 'HEADER TEXT'}
                  </div>

                  <div className="flex justify-between font-bold border-b border-dashed pb-1 text-[11px]">
                    <span>BILL NO: #1001</span>
                    <span>24/04/2026</span>
                  </div>

                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-dashed">
                        <th className="text-left py-1">ITEM</th>
                        <th className="text-center py-1">QTY</th>
                        <th className="text-right py-1">AMT</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1">Paneer Tikka</td>
                        <td className="text-center py-1">2</td>
                        <td className="text-right py-1">500.00</td>
                      </tr>
                      <tr>
                        <td className="py-1">Fresh Lime Soda</td>
                        <td className="text-center py-1">1</td>
                        <td className="text-right py-1">90.00</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="border-t border-dashed pt-2 space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>590.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST Total</span>
                      <span>29.50</span>
                    </div>
                    <div className="flex justify-between font-bold text-sm border-t border-dashed pt-1">
                      <span>TOTAL</span>
                      <span>619.50</span>
                    </div>
                  </div>

                  {layout.show_gst_breakdown && (
                    <div className="text-[8px] border-t border-dashed pt-2">
                      <p className="font-bold mb-1 underline">GST BREAKDOWN</p>
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-dotted">
                            <th className="text-left">RATE</th>
                            <th className="text-right">BASE</th>
                            <th className="text-right">GST</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>5.00%</td>
                            <td className="text-right">590.00</td>
                            <td className="text-right">29.50</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="text-center whitespace-pre-line border-t border-dashed pt-2 text-[9px]">
                    {layout.footer_text || 'FOOTER TEXT'}
                  </div>

                  <div className="text-center text-[7px] pt-4 text-muted-foreground italic">
                    Powered by RestroManager
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    </RoleGuard>
  );
}
