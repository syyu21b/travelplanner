import { api } from "../api";

export type PackageId = "1" | "5" | "10";

export interface CreditPackage {
  id: PackageId;
  credits: number;
  amountKrw: number;
  label: string;
}

export interface PaymentRequest {
  paymentId: string;
  storeId: string;
  channelKey: string;
  orderName: string;
  totalAmount: number;
  currency: "CURRENCY_KRW";
}

export interface AdminPaymentRecord {
  id: string;
  userId: string;
  username: string;
  nickname: string;
  email: string;
  packageId: PackageId;
  credits: number;
  amountKrw: number;
  status: "pending" | "paid" | "failed";
  createdAt: string;
  paidAt: string | null;
}

export const paymentsApi = {
  getPackages: () => api.get<{ packages: CreditPackage[] }>("/payments/packages"),
  getCredits: () => api.get<{ remainingCredits: number }>("/payments/credits"),
  requestPayment: (packageId: PackageId) => api.post<PaymentRequest>("/payments/request", { packageId }),
  completePayment: (paymentId: string) => api.post<{ success: boolean; message: string }>("/payments/complete", { paymentId }),
  getAllPayments: () => api.get<{ payments: AdminPaymentRecord[] }>("/payments/admin/all"),
};
