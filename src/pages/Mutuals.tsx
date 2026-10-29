import { UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/providers/trpc';

type RequestItem = {
  userId: number;
  name: string | null;
  username: string | null;
  avatarColor: string | null;
  createdAt: Date | string;
};

function RequestCard({
  item,
  incoming,
  onAccept,
  onDecline,
  pending,
}: {
  item: RequestItem;
  incoming: boolean;
  onAccept: () => void;
  onDecline: () => void;
  pending: boolean;
}) {
  const name = item.name ?? 'Member';
  return (
    <li className="flex items-center gap-3 rounded-xl border border-haven-border bg-white p-4 shadow-card">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: item.avatarColor ?? '#8B7BC7' }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-haven-text">{name}</p>
        <p className="text-[12px] text-haven-text-muted">
          {incoming ? 'Wants to be mutuals with you' : 'Mutual request sent'}
        </p>
      </div>
      {incoming ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={pending}
            className="rounded-full bg-haven-primary px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={pending}
            className="rounded-full border border-haven-border px-3.5 py-1.5 text-[12px] font-semibold text-haven-text-muted disabled:opacity-40"
          >
            Decline
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onDecline}
          disabled={pending}
          className="shrink-0 rounded-full border border-haven-border px-3.5 py-1.5 text-[12px] font-semibold text-haven-text-muted disabled:opacity-40"
        >
          Cancel request
        </button>
      )}
    </li>
  );
}

export default function Mutuals() {
  const utils = trpc.useUtils();
  const requestsQ = trpc.publicProfile.requests.useQuery(undefined, { retry: false });
  const acceptMutation = trpc.publicProfile.follow.useMutation({
    onSuccess: () => {
      utils.publicProfile.requests.invalidate();
      utils.publicProfile.byUsername.invalidate();
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast('You are now mutuals.');
    },
    onError: () => toast('Could not accept the request — please try again.'),
  });
  const declineMutation = trpc.publicProfile.unfollow.useMutation({
    onSuccess: () => {
      utils.publicProfile.requests.invalidate();
      utils.publicProfile.byUsername.invalidate();
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast('Request updated.');
    },
    onError: () => toast('Could not update the request — please try again.'),
  });

  const incoming = requestsQ.data?.incoming ?? [];
  const outgoing = requestsQ.data?.outgoing ?? [];
  const pending = acceptMutation.isPending || declineMutation.isPending;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="font-serif text-[26px] font-medium text-haven-text">Mutual requests</h1>
      <p className="mb-6 mt-1 text-[13px] leading-relaxed text-haven-text-muted">
        Connections happen only when both members choose them. No followers, just mutuals.
      </p>

      {requestsQ.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl border border-haven-border bg-white shadow-card" />)}
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[16px] font-semibold text-haven-text">
              <UserPlus size={17} strokeWidth={1.75} />
              Requests for you
            </h2>
            {incoming.length === 0 ? (
              <p className="rounded-xl border border-haven-border bg-white p-5 text-center text-[13px] text-haven-text-muted shadow-card">
                No incoming requests right now.
              </p>
            ) : (
              <ul className="space-y-3">
                {incoming.map((item) => (
                  <RequestCard
                    key={item.userId}
                    item={item}
                    incoming
                    pending={pending}
                    onAccept={() => acceptMutation.mutate({ userId: item.userId })}
                    onDecline={() => declineMutation.mutate({ userId: item.userId })}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-[16px] font-semibold text-haven-text">
              <UserCheck size={17} strokeWidth={1.75} />
              Requests you sent
            </h2>
            {outgoing.length === 0 ? (
              <p className="rounded-xl border border-haven-border bg-white p-5 text-center text-[13px] text-haven-text-muted shadow-card">
                No outgoing requests.
              </p>
            ) : (
              <ul className="space-y-3">
                {outgoing.map((item) => (
                  <RequestCard
                    key={item.userId}
                    item={item}
                    incoming={false}
                    pending={pending}
                    onAccept={() => undefined}
                    onDecline={() => declineMutation.mutate({ userId: item.userId })}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
