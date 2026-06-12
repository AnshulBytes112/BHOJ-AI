import publicApiClient from './publicApiClient';
import { MenuItem } from '../types/customer';

export const menuService = {
  async fetchCategories() {
    const response = await publicApiClient.get('/categories');
    return response.data;
  },

  async fetchMenuItems(): Promise<MenuItem[]> {
    const response = await publicApiClient.get('/items');
    return response.data;
  }
};
