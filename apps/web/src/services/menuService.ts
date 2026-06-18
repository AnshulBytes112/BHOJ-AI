import publicApiClient from './publicApiClient';
import { MenuItem } from '../types/customer';

export const menuService = {
  async fetchCategories(tableId?: string) {
    const response = await publicApiClient.get('/categories', { params: { tableId } });
    return response.data;
  },

  async fetchMenuItems(tableId?: string): Promise<MenuItem[]> {
    const response = await publicApiClient.get('/items', { params: { tableId } });
    return response.data;
  }
};
