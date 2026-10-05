import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  syncTeacherReceivablesDetailed,
  fetchTeacherExpensesList,
  RealInvoice,
  ReceivableSyncIssue,
  Expense,
} from "@/lib/finance-engine";

export const FINANCE_INVOICES_QUERY_KEY = (teacherId: string | undefined) => ["finance-invoices", teacherId];
export const FINANCE_EXPENSES_QUERY_KEY = (teacherId: string | undefined) => ["finance-expenses", teacherId];

type FinanceInvoicesData = { invoices: RealInvoice[]; issues: ReceivableSyncIssue[] };

export function useFinanceInvoicesQuery(teacherId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<FinanceInvoicesData>({
    queryKey: FINANCE_INVOICES_QUERY_KEY(teacherId),
    queryFn: async (): Promise<FinanceInvoicesData> => {
      if (!teacherId) return { invoices: [], issues: [] };
      return syncTeacherReceivablesDetailed(teacherId);
    },
    enabled: Boolean(teacherId),
    // Opening Financeiro must always run the receivables sync so contracts saved elsewhere appear immediately.
    staleTime: 0,
    refetchOnMount: "always",
    gcTime: 10 * 60 * 1000,
  });

  return {
    invoices: query.data?.invoices || [],
    syncIssues: query.data?.issues || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    setInvoicesCache: (updater: (prev: RealInvoice[]) => RealInvoice[]) => {
      if (teacherId) {
        queryClient.setQueryData<FinanceInvoicesData>(FINANCE_INVOICES_QUERY_KEY(teacherId), (old) => ({
          invoices: updater(old?.invoices || []),
          issues: old?.issues || [],
        }));
      }
    },
  };
}

export function useTeacherExpensesQuery(teacherId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<Expense[]>({
    queryKey: FINANCE_EXPENSES_QUERY_KEY(teacherId),
    queryFn: async (): Promise<Expense[]> => {
      if (!teacherId) return [];
      return fetchTeacherExpensesList(teacherId);
    },
    enabled: Boolean(teacherId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    expenses: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    setExpensesCache: (updater: (prev: Expense[]) => Expense[]) => {
      if (teacherId) {
        queryClient.setQueryData<Expense[]>(FINANCE_EXPENSES_QUERY_KEY(teacherId), (old) => updater(old || []));
      }
    },
  };
}
