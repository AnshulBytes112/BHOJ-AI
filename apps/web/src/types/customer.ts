export interface MenuItem {
  id: number;
  serial_number: string;
  name: string;
  selling_price: number;
  category: string;
  image_url?: string;
  gst_rate?: number;
  stock_quantity?: number;
  stock_type?: string;
}

export interface CartItem extends MenuItem {
  quantity: number;
  spiceLevel?: 'Mild' | 'Medium' | 'Hot';
  extras?: string[];
  notes?: string;
}

export interface OrderItem {
  order_item_id: string;
  item_id: number;
  item_name: string;
  quantity: number;
  price_at_billing: string;
  item_status: string;
  gst_percent_at_billing?: string | number;
}

export interface Order {
  order_id: string;
  table_id: string;
  order_phase: number;
  order_status: string;
  status: string; // derived KOT/order status (sent_to_kitchen, preparing, ready, completed)
  created_at: string;
  items: OrderItem[];
}

export interface Table {
  id: string;
  table_number: string;
  status: string;
  active_session_id?: string;
}
