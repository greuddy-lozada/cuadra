import apiClient from '@/lib/api/api-client';
import { Stock, StockAlert, CreateStockRequest, UpdateStockRequest, KardexPage } from '../models/stock.model';

export const stockService = {
  async getAlerts(threshold = 5): Promise<StockAlert[]> {
    const res = await apiClient.get('/stocks/alerts', { params: { threshold } });
    return res.data.data;
  },

  async getAll(): Promise<Stock[]> {
    const response = await apiClient.get('/stocks');
    return response.data.data;
  },

  async getById(id: string): Promise<Stock> {
    const response = await apiClient.get(`/stocks/${id}`);
    return response.data.data;
  },

  async create(data: CreateStockRequest): Promise<Stock> {
    const response = await apiClient.post('/stocks', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateStockRequest): Promise<Stock> {
    const response = await apiClient.patch(`/stocks/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/stocks/${id}`);
  },

  async getKardex(productId: string, page = 1, limit = 20): Promise<KardexPage> {
    const response = await apiClient.get('/stocks/kardex', {
      params: { productId, page, limit },
    });
    const meta = response.data.meta ?? {};
    return {
      rows: response.data.data ?? [],
      total: meta.total ?? 0,
      page: meta.page ?? page,
      limit: meta.limit ?? limit,
      totalPages: meta.totalPages ?? 1,
    };
  },
};
