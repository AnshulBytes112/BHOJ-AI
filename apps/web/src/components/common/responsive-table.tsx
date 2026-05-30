import React from 'react';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { cn } from '@/lib/utils';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  mobileCardRender?: (row: T) => React.ReactNode;
  className?: string;
  loading?: boolean;
}

export function ResponsiveTable<T>({
  data,
  columns,
  rowKey,
  mobileCardRender,
  className,
  loading = false,
}: ResponsiveTableProps<T>) {
  const { isMobile } = useBreakpoint();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No records found.
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-4">
        {data.map((row) => (
          <div key={rowKey(row)} className="bg-white border rounded-xl p-4 shadow-sm space-y-2">
            {mobileCardRender ? (
              mobileCardRender(row)
            ) : (
              // Default mobile card render
              columns.map((col, idx) => {
                const val = typeof col.accessor === 'function' 
                  ? col.accessor(row) 
                  : (row[col.accessor] as React.ReactNode);
                return (
                  <div key={idx} className="flex justify-between text-xs py-1 border-b last:border-0 border-gray-50">
                    <span className="font-medium text-muted-foreground">{col.header}</span>
                    <span className="font-semibold text-foreground text-right">{val}</span>
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>
    );
  }

  // Desktop/Tablet normal table
  return (
    <div className={cn("overflow-x-auto border rounded-xl bg-white shadow-sm", className)}>
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={cn("px-6 py-4 font-semibold text-slate-600", col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={rowKey(row)} className="bg-white border-b hover:bg-slate-50 transition-colors">
              {columns.map((col, idx) => {
                const val = typeof col.accessor === 'function' 
                  ? col.accessor(row) 
                  : (row[col.accessor] as React.ReactNode);
                return (
                  <td key={idx} className={cn("px-6 py-4 text-foreground font-medium", col.className)}>
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
