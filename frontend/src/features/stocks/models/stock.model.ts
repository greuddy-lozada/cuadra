export interface Stock {
  id: string;
  idProduct: string;
  idSupplier?: string;
  idBatch?: string;
  existence: number;
  available: boolean;
  product?: {
    id: string;
    code: string;
    name: string;
  };
  supplier?: {
    id: string;
    companyName: string;
  };
  batch?: {
    id: string;
    code: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockRequest {
  idProduct: string;
  idSupplier?: string;
  idBatch?: string;
  existence: number;
}

export interface StockAlert {
  id: string;
  name: string;
  price: number;
  totalExistence: number;
}

export interface UpdateStockRequest {
  idProduct?: string;
  idSupplier?: string;
  idBatch?: string;
  existence?: number;
  available?: boolean;
}

export interface KardexMovement {
  id: string;
  createdAt: string;
  type: number;
  quantity: number;
  entry: number | null;
  exit: number | null;
  balanceAfter: number | null;
  observation: string | null;
  referenceType: string | null;
  batchCode: string | null;
  document: 'sale' | 'purchase' | 'opening' | 'adjustment';
}

export interface KardexPage {
  rows: KardexMovement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
