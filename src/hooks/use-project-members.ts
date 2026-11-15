import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import {
  inviteProjectMember, leaveProject, listMyProjectInvites, listProjectMembers, myProjectInvitesKey, projectMembersKey,
  removeProjectMember, respondProjectInvite, sortMembers,
} from "@/lib/workspace-project-members";
import { workspaceProjectKey, workspaceProjectsKey } from "@/lib/workspace-projects-data";
import { workspaceNotesKey } from "@/lib/workspace-notes-data";

function useSession() {
  const { user, session, loading } = useAuth();
  const userId = user?.id;
  return { userId, authenticated: !loading && Boolean(userId && session?.user.id === userId) };
}

/** Participants and invites of one project (owner sees pending e-mails; participants see accepted only). */
export function useProjectMembers(projectId: string, enabled = true) {
  const { userId, authenticated } = useSession();
  const client = useQueryClient();
  const key = projectMembersKey(userId, projectId);
  const query = useQuery({
    queryKey: key, enabled: authenticated && enabled, staleTime: 30_000,
    queryFn: () => listProjectMembers(projectId),
    select: sortMembers,
  });
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: key }),
    client.invalidateQueries({ queryKey: workspaceProjectsKey(userId) }),
  ]);
  const invite = useMutation({ mutationFn: (email: string) => inviteProjectMember(projectId, email), onSettled: refresh });
  const remove = useMutation({ mutationFn: (memberId: string) => removeProjectMember(memberId), onSettled: refresh });
  const leave = useMutation({
    mutationFn: () => leaveProject(projectId),
    onSuccess: () => {
      // Access ends immediately: drop this project's cached data and refresh the list.
      client.removeQueries({ queryKey: workspaceProjectKey(userId, projectId) });
      client.removeQueries({ queryKey: workspaceNotesKey(userId, projectId) });
      client.removeQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: workspaceProjectsKey(userId) });
    },
  });
  return { members: query.data, isLoading: query.isPending && authenticated && enabled, error: query.error, refetch: query.refetch, invite, remove, leave };
}

/** Invites received by the signed-in teacher; accepting refreshes the projects list. */
export function useMyProjectInvites() {
  const { userId, authenticated } = useSession();
  const client = useQueryClient();
  const key = myProjectInvitesKey(userId);
  const query = useQuery({ queryKey: key, enabled: authenticated, staleTime: 30_000, refetchOnWindowFocus: true, queryFn: listMyProjectInvites });
  const respond = useMutation({
    mutationFn: ({ memberId, accept }: { memberId: string; accept: boolean }) => respondProjectInvite(memberId, accept),
    onSettled: () => Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: workspaceProjectsKey(userId) }),
    ]),
  });
  return { invites: query.data, isLoading: query.isPending && authenticated, error: query.error, refetch: query.refetch, respond };
}
