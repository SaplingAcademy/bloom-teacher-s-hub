import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import {
  cancelContactRequest, listMyContacts, normalizeContactQuery, removeContact, respondContactRequest, searchTeachers,
  sendContactRequest, teacherContactsKey, teacherSearchKey, type SendResult,
} from "@/lib/teacher-contacts";

export type ContactAction =
  | { type: "send"; teacherId: string }
  | { type: "accept" | "decline" | "cancel"; requestId: string }
  | { type: "remove"; otherId: string };

/** Target id of an action, used to show a spinner only on the row being changed. */
export const actionTarget = (action: ContactAction) =>
  action.type === "send" ? action.teacherId : action.type === "remove" ? action.otherId : action.requestId;

function useOwner() {
  const { user, session, loading } = useAuth();
  const owner = user?.id;
  return { owner, authenticated: !loading && Boolean(owner && session?.user.id === owner) };
}

/** Accepted contacts and pending requests (both directions) of the signed-in teacher. */
export function useTeacherContacts() {
  const { owner, authenticated } = useOwner();
  return useQuery({
    queryKey: teacherContactsKey(owner), enabled: authenticated, staleTime: 30_000,
    queryFn: listMyContacts,
  });
}

/** Debounced search; only complete e-mails or names with 3+ characters reach the RPC. */
export function useTeacherSearch(raw: string, delayMs = 300) {
  const { owner, authenticated } = useOwner();
  const [query, setQuery] = useState(() => normalizeContactQuery(raw));
  useEffect(() => {
    const timer = setTimeout(() => setQuery(normalizeContactQuery(raw)), delayMs);
    return () => clearTimeout(timer);
  }, [raw, delayMs]);
  const search = useQuery({
    queryKey: teacherSearchKey(owner, query ?? ""), enabled: authenticated && Boolean(query), staleTime: 15_000,
    queryFn: () => searchTeachers(query!),
  });
  return { query, ...search };
}

/** All writes go through the RPCs; afterwards both the lists and any search are re-read. */
export function useContactActions() {
  const { owner } = useOwner();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (action: ContactAction): Promise<SendResult | null> => {
      if (action.type === "send") return sendContactRequest(action.teacherId);
      if (action.type === "accept" || action.type === "decline") await respondContactRequest(action.requestId, action.type === "accept");
      else if (action.type === "cancel") await cancelContactRequest(action.requestId);
      else if (action.type === "remove") await removeContact(action.otherId);
      return null;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["teacher-contacts", owner] }),
  });
  return {
    run: mutation.mutateAsync,
    pendingTarget: mutation.isPending && mutation.variables ? actionTarget(mutation.variables) : null,
    isPending: mutation.isPending,
  };
}
