import publicApiClient from './publicApiClient';
import { Order, Table } from '../types/customer';

export const orderService = {
  async fetchTableDetails(tableId: string): Promise<Table> {
    const response = await publicApiClient.get(`/tables/${tableId}`);
    return response.data;
  },

  async fetchSessionOrders(tableId: string): Promise<Order[]> {
    const response = await publicApiClient.get(`/tables/${tableId}/orders`);
    return response.data.orders || [];
  },

  async submitOrder(tableId: string, items: any[]): Promise<any> {
    const response = await publicApiClient.post(`/tables/${tableId}/orders`, {
      items,
      source_type: 'CUSTOMER_QR'
    });
    return response.data;
  },

  async callWaiterAlert(tableId: string, requestType?: string): Promise<void> {
    await publicApiClient.post(`/tables/${tableId}/call-waiter`, { requestType });
  },

  async requestBillInvoice(tableId: string): Promise<void> {
    await publicApiClient.post(`/tables/${tableId}/request-bill`);
  }
};
