'use client';

import { formatDate } from '@/lib/utils';

export type ReceiptData = {
  bill_serial_number: number;
  created_at: string;
  header_text: string;
  footer_text: string;
  logo_url: string | null;
  show_gst_breakdown: boolean;
  items: Array<{
    item_name: string;
    quantity: number;
    unit_price: string;
    gst_rate: string;
    gst_amount: string;
    line_total: string;
  }>;
  subtotal: string;
  gst_total: string;
  grand_total: string;
};

export function ReceiptPrint({ data }: { data: ReceiptData }) {
  // Group GST by rate for breakdown
  const gstSlabs = data.items.reduce((acc, item) => {
    const rate = Number(item.gst_rate).toFixed(2);
    if (!acc[rate]) {
      acc[rate] = { base: 0, gst: 0 };
    }
    acc[rate].base += Number(item.unit_price) * item.quantity;
    acc[rate].gst += Number(item.gst_amount);
    return acc;
  }, {} as Record<string, { base: number; gst: number }>);

  return (
    <div className="receipt-print-content bg-white font-mono text-black max-w-[400px] mx-auto print:p-0 print:m-0 print:max-w-none print:block print:w-full print:static" style={{ padding: '16px 12px', fontSize: '12px', lineHeight: '1.6' }}>
      <style jsx global>{`
        @media print {
          /* Hide everything by default */
          body * {
            visibility: hidden;
          }
          /* Show the receipt content specifically */
          .receipt-print-content,
          .receipt-print-content * {
            visibility: visible !important;
          }
          /* Position the receipt at the top left */
          .receipt-print-content {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8px !important;
            border: none !important;
          }
          /* Hide the dashboard and other containers specifically to be sure */
          .print\\:hidden, 
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Logo */}
      {data.logo_url && (
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <img src={data.logo_url} alt="Logo" style={{ maxHeight: '60px', objectFit: 'contain', filter: 'grayscale(1)', margin: '0 auto' }} />
        </div>
      )}

      {/* Header Text in dashed border box */}
      <div style={{
        textAlign: 'center',
        border: '1px dashed #000',
        padding: '6px 12px',
        marginBottom: '8px',
        whiteSpace: 'pre-line',
        fontSize: '13px',
      }}>
        {data.header_text}
      </div>

      {/* Bill No & Date/Time - left aligned inline */}
      <div style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 'bold' }}>
        <div>BILL NO: #{data.bill_serial_number}</div>
        <div>DATE & TIME:{formatDate(data.created_at)}</div>
      </div>

      {/* Dashed separator */}
      <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }} />

      {/* Items Table Header */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', paddingBottom: '4px', fontWeight: 'bold', fontSize: '11px' }}>ITEM</th>
            <th style={{ textAlign: 'center', paddingBottom: '4px', fontWeight: 'bold', fontSize: '11px' }}>QTY</th>
            <th style={{ textAlign: 'right', paddingBottom: '4px', fontWeight: 'bold', fontSize: '11px' }}>PRICE</th>
            <th style={{ textAlign: 'right', paddingBottom: '4px', fontWeight: 'bold', fontSize: '11px' }}>TOTAL</th>
          </tr>
        </thead>
      </table>

      {/* Dashed separator under header */}
      <div style={{ borderBottom: '1px dashed #000', marginBottom: '6px' }} />

      {/* Items Table Body */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          {data.items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ paddingBottom: '6px', verticalAlign: 'top' }}>
                <div style={{ fontWeight: 500 }}>{item.item_name}</div>
                <div style={{ fontSize: '10px', color: '#555', fontStyle: 'italic' }}>GST: {Number(item.gst_rate).toFixed(2)}%</div>
              </td>
              <td style={{ textAlign: 'center', paddingBottom: '6px', verticalAlign: 'top' }}>{item.quantity}</td>
              <td style={{ textAlign: 'right', paddingBottom: '6px', verticalAlign: 'top' }}>{Number(item.unit_price).toFixed(2)}</td>
              <td style={{ textAlign: 'right', paddingBottom: '6px', verticalAlign: 'top', fontWeight: 'bold' }}>{Number(item.line_total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Dashed separator */}
      <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }} />

      {/* Subtotal, GST, Grand Total */}
      <div style={{ marginBottom: '12px', fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>Subtotal</span>
          <span>Rs {Number(data.subtotal).toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span>GST Total</span>
          <span>Rs {Number(data.gst_total).toFixed(2)}</span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 'bold',
          fontSize: '15px',
          borderTop: '1px dashed #000',
          paddingTop: '8px',
        }}>
          <span>GRAND TOTAL</span>
          <span>Rs {Number(data.grand_total).toFixed(2)}</span>
        </div>
      </div>

      {/* GST Breakdown Summary */}
      {data.show_gst_breakdown && (
        <div style={{ borderTop: '1px dashed #000', paddingTop: '8px', marginBottom: '12px', fontSize: '10px' }}>
          <div style={{ fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', marginBottom: '6px' }}>
            GST Breakdown Summary
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px dotted #000' }}>
                <th style={{ textAlign: 'left', paddingBottom: '2px', fontWeight: 'bold' }}>GST RATE</th>
                <th style={{ textAlign: 'right', paddingBottom: '2px', fontWeight: 'bold' }}>TAXABLE AMT</th>
                <th style={{ textAlign: 'right', paddingBottom: '2px', fontWeight: 'bold' }}>GST AMT</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(gstSlabs).map(([rate, vals]) => (
                <tr key={rate}>
                  <td style={{ paddingTop: '2px' }}>{rate}%</td>
                  <td style={{ textAlign: 'right', paddingTop: '2px' }}>{vals.base.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', paddingTop: '2px' }}>{vals.gst.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer text */}
      <div style={{
        textAlign: 'center',
        borderTop: '1px dashed #000',
        paddingTop: '12px',
        marginBottom: '16px',
        whiteSpace: 'pre-line',
        fontSize: '12px',
        fontStyle: 'italic',
      }}>
        {data.footer_text}
      </div>

      {/* Software branding */}
      <div style={{
        textAlign: 'center',
        fontSize: '9px',
        color: 'rgba(0,0,0,0.5)',
        fontStyle: 'italic',
        borderTop: '1px solid rgba(0,0,0,0.1)',
        paddingTop: '6px',
      }}>
        Software by RestroManager
      </div>
    </div>
  );
}
