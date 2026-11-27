export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerHistorySummary {
  customerId: string;
  totalEstimates: number;
  totalCompletedJobs: number;
  totalRevenue: number;
  lastJobAt: string | null;
  isRepeatCustomer: boolean;
}
