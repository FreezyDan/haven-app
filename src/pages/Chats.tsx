import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Archive, BellOff, CheckSquare, Copy, Flag, ImagePlus, MoreHorizontal, Pencil, Pin, Reply, Search, Send, ShieldAlert, ShieldBan, Star, Trash2, User, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import { useHavenUi } from '@/components/Layout';
import BlockConfirmDialog from '@/components/BlockConfirmDialog';
import ReportDialog, { type ReportCategory } from '@/components/ReportDialog';
import { avatarColorFor } from '@/lib/avatarColor';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const CRISIS_WORDS = ['suicide', 'suicidal', 'self-harm', 'self harm', 'kill myself', 'end it all', 'want to die'];

function relativeTime(date: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function isSameDay(a: Date | string, b: Date | string) {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function messageDay(date: Date | string): string {
  const value = new Date(date);
  const now = new Date();
  if (isSameDay(value, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(value, yesterday)) return 'Yesterday';
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function messageTime(date: Date | string): string {
  const value = new Date(date);
  if (isSameDay(value, new Date())) {
    return value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function readImageFile(file: File, onLoad: (dataUrl: string) => void) {
  if (!file.type.startsWith('image/')) {
    toast('Please choose an image file.');
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    toast('Each image must be smaller than 3 MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') onLoad(reader.result);
  };
  reader.onerror = () => toast('That image could not be read. Please try another one.');
  reader.readAsDataURL(file);
}

export default function Chats() {
  const { openCrisis } = useHavenUi();
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useUtils();
  const reduceMotion = useReducedMotion();

  const meQ = trpc.profile.get.useQuery(undefined, { retry: 1 });
  const emailSenderQ = trpc.moderation.emailSender.useQuery(undefined, { retry: false });
  const myUserId = meQ.data?.userId ?? null;
  const [tab, setTab] = useState<'general' | 'requests' | 'archived'>('general');

  const conversationsQ = trpc.messages.conversations.useQuery(
    { includeArchived: tab === 'archived' },
    {
      retry: 1,
      refetchInterval: 5_000,
      notifyOnChangeProps: ['data', 'error'],
    },
  );
  const conversations = useMemo(() => conversationsQ.data ?? [], [conversationsQ.data]);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ message: (typeof messages)[number]; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<(typeof messages)[number] | null>(null);
  const [deleteChatOpen, setDeleteChatOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [optimistic, setOptimistic] = useState<(typeof messages)[number][]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const senderHandledRef = useRef(false);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const activeOtherLastActive = active?.other.lastActiveAt ? new Date(active.other.lastActiveAt).getTime() : 0;
  const activeOtherTyping = active?.other.typing ?? false;
  const activeIsRequestForMe = !!active && active.status === 'pending' && !active.initiatedByMe;
  const activeAwaitingAcceptance = !!active && active.status === 'pending' && active.initiatedByMe;
  const activeDmClosed = !!active && active.other.dmPolicy === 'nobody';

  const messagesQ = trpc.messages.messages.useInfiniteQuery(
    { conversationId: activeId ?? 0, limit: 50 },
    {
      enabled: activeId != null,
      retry: false,
      refetchInterval: 5_000,
      notifyOnChangeProps: ['data', 'error'],
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const messages = useMemo(
    () => (messagesQ.data?.pages ?? []).flatMap((page) => page.messages),
    [messagesQ.data],
  );
  const allMessages = useMemo(
    () => [...messages, ...optimistic].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages, optimistic],
  );

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => {
      utils.messages.messages.invalidate({ conversationId: activeId ?? 0 });
      utils.messages.conversations.invalidate();
    },
    onError: () => toast('Your message could not be sent — please try again.'),
  });
  const setStatusMutation = trpc.messages.setStatus.useMutation({
    onSuccess: (_r, vars) => {
      utils.messages.conversations.invalidate();
      utils.messages.messages.invalidate({ conversationId: vars.conversationId });
      if (vars.status === 'accepted') {
        toast('Request accepted. Be gentle with each other. 💚');
      } else {
        if (activeId === vars.conversationId) setActiveId(null);
        toast('No worries — the request has been quietly set aside.');
      }
    },
    onError: () => toast('That did not work — please try again.'),
  });
  const markReadMutation = trpc.messages.markRead.useMutation({
    onSuccess: () => {
      utils.messages.conversations.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const blockMutation = trpc.blocks.block.useMutation({
    onSuccess: () => {
      utils.messages.conversations.invalidate();
      utils.blocks.list.invalidate();
      setBlockOpen(false);
      setActiveId(null);
      toast("You've blocked this member. They can no longer reach you.");
    },
    onError: () => toast('Could not block this member — please try again.'),
  });
  const reportMutation = trpc.moderation.file.useMutation({
    onError: () => toast('The report could not be sent — please try again.'),
  });
  const deleteMutation = trpc.messages.delete.useMutation({
    onSuccess: () => {
      utils.messages.messages.invalidate({ conversationId: activeId ?? 0 });
      utils.messages.conversations.invalidate();
      setSelecting(false);
      setSelectedIds(new Set());
    },
    onError: (error) => toast(error.message),
  });
  const deleteChatMutation = trpc.messages.deleteChat.useMutation({
    onSuccess: () => {
      utils.messages.conversations.invalidate();
      setDeleteChatOpen(false);
      setActiveId(null);
      toast('Chat deleted for you.');
    },
    onError: () => toast('The chat could not be deleted — please try again.'),
  });
  const muteMutation = trpc.messages.mute.useMutation({
    onSuccess: (_result, vars) => {
      utils.messages.conversations.invalidate();
      setMuteOpen(false);
      toast(vars.duration === 'off' ? 'Chat unmuted.' : 'Chat muted.');
    },
    onError: () => toast('Could not update the mute setting — please try again.'),
  });
  const editMutation = trpc.messages.edit.useMutation({
    onSuccess: () => {
      utils.messages.messages.invalidate({ conversationId: activeId ?? 0 });
      setEditingId(null);
      setDraft('');
      toast('Message edited.');
    },
    onError: (error) => toast(error.message),
  });
  const typingMutation = trpc.messages.typing.useMutation();
  const archiveMutation = trpc.messages.archive.useMutation({
    onSuccess: (_result, vars) => {
      utils.messages.conversations.invalidate();
      setActiveId(null);
      toast(vars.archived ? 'Chat archived.' : 'Chat moved back to General.');
    },
    onError: () => toast('Could not update this chat. Please try again.'),
  });
  const pinMutation = trpc.messages.pin.useMutation({
    onSuccess: () => utils.messages.messages.invalidate({ conversationId: activeId ?? 0 }),
    onError: (error) => toast(error.message),
  });
  const starMutation = trpc.messages.star.useMutation({
    onSuccess: () => utils.messages.messages.invalidate({ conversationId: activeId ?? 0 }),
    onError: (error) => toast(error.message),
  });
  const forwardMutation = trpc.messages.forward.useMutation({
    onSuccess: () => toast('Message forwarded.'),
  });
  const restoreMutation = trpc.messages.restore.useMutation({
    onSuccess: () => {
      utils.messages.messages.invalidate({ conversationId: activeId ?? 0 });
      toast('Messages restored.');
    },
  });

  const filtered = useMemo(
    () =>
      conversations.filter((c) => {
        const isIncomingRequest = c.status === 'pending' && !c.initiatedByMe;
        const inTab = tab === 'archived' ? c.archivedAt != null : tab === 'requests' ? isIncomingRequest : !isIncomingRequest;
        const name = c.other.name ?? c.other.username ?? '';
        return inTab && name.toLowerCase().includes(query.trim().toLowerCase());
      }),
    [conversations, query, tab],
  );

  const requestCount = conversations.filter((c) => c.status === 'pending' && !c.initiatedByMe).length;

  useEffect(() => {
    if (!active) return;
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    if (draft.trim()) {
      typingMutation.mutate({ conversationId: active.id, typing: true });
      typingTimeout.current = window.setTimeout(() => {
        typingMutation.mutate({ conversationId: active.id, typing: false });
      }, 2000);
    } else {
      typingMutation.mutate({ conversationId: active.id, typing: false });
    }
    return () => {
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, active]);

  // If a connection stops being mutual, close any conversation that the
  // server has now hidden from the list.
  useEffect(() => {
    if (activeId != null && conversationsQ.data && !conversations.some((c) => c.id === activeId)) {
      setActiveId(null);
    }
  }, [conversations, activeId, conversationsQ.data]);

  const selectedMessages = useMemo(
    () => allMessages.filter((m) => selectedIds.has(m.id)),
    [allMessages, selectedIds],
  );
  const filteredMessages = useMemo(
    () => allMessages.filter((m) => m.body.toLowerCase().includes(messageQuery.trim().toLowerCase())),
    [allMessages, messageQuery],
  );
  const pinnedMessages = useMemo(
    () => allMessages.filter((m) => m.pinnedAt != null),
    [allMessages],
  );

  const canDeleteEveryone =
    selectedMessages.length > 0 &&
    selectedMessages.every(
      (m) =>
        m.senderId === myUserId &&
        !m.deleted &&
        Date.now() - new Date(m.createdAt).getTime() <= 60 * 60 * 1000,
    );

  useEffect(() => {
    setSelecting(false);
    setSelectedIds(new Set());
    setEditingId(null);
    setReplyTo(null);
    setContextMenu(null);
    setImages([]);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const key = `haven.chat.draft.${activeId}`;
    setDraft(localStorage.getItem(key) ?? '');
    return () => {
      localStorage.setItem(key, draft);
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    localStorage.setItem(`haven.chat.draft.${activeId}`, draft);
  }, [draft, activeId]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const toggleSelected = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = (mode: 'me' | 'everyone') => {
    if (!active || selectedIds.size === 0) return;
    if (mode === 'everyone' && !canDeleteEveryone) {
      toast('Delete for everyone is only available for your own messages within 1 hour.');
      return;
    }
    const variables = { conversationId: active.id, messageIds: [...selectedIds], mode };
    deleteMutation.mutate(variables, {
      onSuccess: () => {
        toast('Messages deleted.', {
          duration: 6000,
          action: {
            label: 'Undo',
            onClick: () => restoreMutation.mutate(variables),
          },
        });
      },
    });
  };

  // Notification deep-link: open the exact official conversation in Chats.
  const senderName = (location.state as { senderName?: string } | null)?.senderName;
  useEffect(() => {
    if (!senderName || senderHandledRef.current || conversations.length === 0) return;
    const conversation = conversations.find(
      (c) => (c.other.name ?? c.other.username) === senderName,
    );
    if (!conversation) return;
    senderHandledRef.current = true;
    setTab('general');
    setActiveId(conversation.id);
  }, [senderName, conversations]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHeaderMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [headerMenuOpen]);

  const crisisNudge = useMemo(
    () => CRISIS_WORDS.some((w) => draft.toLowerCase().includes(w)),
    [draft],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeId]);

  const selectConversation = (id: number) => {
    setActiveId(id);
    setDraft('');
    setHeaderMenuOpen(false);
    const convo = conversations.find((c) => c.id === id);
    if (convo && convo.unread > 0) markReadMutation.mutate({ conversationId: id });
  };

  const send = () => {
    const text = draft.trim();
    if ((!text && images.length === 0) || !active || sendMutation.isPending || editMutation.isPending) return;
    if (editingId) {
      editMutation.mutate({ messageId: editingId, body: text });
      return;
    }
    const tempId = -Date.now();
    const optimisticMessage = {
      id: tempId,
      conversationId: active.id,
      senderId: myUserId ?? 0,
      body: text,
      images: images.length ? images : null,
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
      deleted: false,
      replyTo: replyTo
        ? { id: replyTo.id, senderId: replyTo.senderId, body: replyTo.body, image: replyTo.image ?? null, replyToMessageId: replyTo.replyToMessageId ?? null }
        : null,
      readAt: null,
      deliveredAt: null,
      starred: false,
      pinnedAt: null,
      forwardedFromMessageId: null,
      forwardedFromConversationId: null,
    } as any;
    setOptimistic((current) => [...current, optimisticMessage]);
    setDraft('');
    setReplyTo(null);
    setImages([]);
    sendMutation.mutate(
      {
        conversationId: active.id,
        body: text,
        ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
        ...(images.length ? { images } : {}),
      },
      {
        onSuccess: () => {
          setOptimistic([]);
          localStorage.removeItem(`haven.chat.draft.${active.id}`);
          utils.messages.messages.invalidate({ conversationId: active.id });
          utils.messages.conversations.invalidate();
        },
        onError: () => {
          setOptimistic((current) => current.filter((m) => m.id !== tempId));
          setDraft(text);
          setImages(images);
          toast('Message could not be sent.', {
            action: { label: 'Retry', onClick: () => send() },
          });
        },
      },
    );
  };

  const startEditMessage = (message: (typeof messages)[number]) => {
    setEditingId(message.id);
    setDraft(message.body);
    setReplyTo(null);
    setContextMenu(null);
  };

  const startReplyMessage = (message: (typeof messages)[number]) => {
    setReplyTo(message);
    setEditingId(null);
    setContextMenu(null);
    window.setTimeout(() => document.getElementById('chat-composer')?.focus(), 0);
  };

  const copyMessage = async (message: (typeof messages)[number]) => {
    setContextMenu(null);
    try {
      await navigator.clipboard.writeText(message.body);
      toast('Message copied.');
    } catch {
      toast('Could not copy this message.');
    }
  };

  const onImagesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const remaining = Math.max(0, 6 - images.length);
    if (files.length > remaining) toast('You can attach up to 6 images per message.');
    for (const file of files.slice(0, remaining)) {
      readImageFile(file, (dataUrl: string) => setImages((current) => [...current, dataUrl].slice(0, 6)));
    }
  };

  const deleteFromMenu = (message: (typeof messages)[number]) => {
    setSelectedIds(new Set([message.id]));
    setSelecting(true);
    setContextMenu(null);
  };

  const headerMenuAction = (action: 'profile' | 'block' | 'report' | 'select' | 'delete-chat' | 'mute' | 'archive') => {
    setHeaderMenuOpen(false);
    if (!active) return;
    if (action === 'profile') {
      navigate(active.other.username ? `/u/${active.other.username}` : `/u/id/${active.other.userId}`);
    } else if (action === 'block') {
      setBlockOpen(true);
    } else if (action === 'report') {
      setReportOpen(true);
    } else if (action === 'select') {
      setSelectedIds(new Set());
      setSelecting(true);
    } else if (action === 'delete-chat') {
      setDeleteChatOpen(true);
    } else if (action === 'mute') {
      if (active.muted) muteMutation.mutate({ conversationId: active.id, duration: 'off' });
      else setMuteOpen(true);
    } else if (action === 'archive') {
      archiveMutation.mutate({ conversationId: active.id, archived: !active.archivedAt });
    }
  };

  const otherName = active ? (active.other.name ?? active.other.username ?? 'Member') : '';

  return (
    <div className="flex w-full flex-col">
      {/* 1. Permanent peer-support disclaimer */}
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-haven-warn-soft px-4 py-2.5">
        <ShieldAlert size={18} strokeWidth={1.75} className="shrink-0 text-haven-warn-text" />
        <p className="text-[13px] leading-snug text-haven-warn-text">
          <span className="font-semibold">Peer support, not therapy.</span> Our members care, but
          they aren't professionals. If you're in crisis, please use Crisis support (bottom left) or call/text{' '}
          <span className="font-semibold">988</span>.
        </p>
      </div>

      {!online && (
        <div className="mb-4 rounded-xl border border-haven-warn-border bg-haven-warn-soft px-4 py-2.5 text-[13px] text-haven-warn-text">
          You’re offline. Your draft is saved — reconnect to send it.
        </div>
      )}

      {/* 2. Two-pane body */}
      <div className="flex h-[calc(100dvh-120px)] min-h-[480px] overflow-hidden rounded-xl border border-haven-border bg-white shadow-card">
        {/* Left pane — conversation list */}
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-haven-border">
          <div className="border-b border-haven-border p-4">
            <h2 className="text-lg font-semibold text-haven-text">Messages</h2>
            <div className="relative mt-3">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haven-text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-full border border-haven-border bg-haven-canvas py-1.5 pl-9 pr-3 text-sm text-haven-text outline-none placeholder:text-haven-text-muted focus:ring-2 focus:ring-haven-primary/40"
              />
            </div>
            <div className="mt-3 flex rounded-full bg-haven-canvas p-1" role="tablist">
              {(
                [
                  { key: 'general', label: 'General' },
                  { key: 'requests', label: requestCount > 0 ? `Requests (${requestCount})` : 'Requests' },
                  { key: 'archived', label: 'Archived' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'relative flex-1 rounded-full py-1.5 text-[13px] font-medium transition-colors duration-200',
                    tab === t.key ? 'text-white' : 'text-haven-text-muted hover:text-haven-text',
                  )}
                >
                  {tab === t.key && (
                    <motion.span
                      layoutId="chat-tab-pill"
                      className="absolute inset-0 rounded-full bg-haven-primary"
                      transition={{ duration: 0.3, ease: EASE }}
                    />
                  )}
                  <span className="relative z-10">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="scrollbar-calm flex-1 overflow-y-auto p-2">
            {conversationsQ.isError ? (
              <div className="p-4 text-center">
                <p className="text-[13px] text-haven-text-muted">Chats couldn’t load.</p>
                <button
                  type="button"
                  onClick={() => conversationsQ.refetch()}
                  className="mt-2 rounded-full bg-haven-primary px-3 py-1.5 text-[12px] font-semibold text-white"
                >
                  Retry
                </button>
              </div>
            ) : conversationsQ.isLoading ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-haven-border/30" />
                ))}
              </div>
            ) : (
              <>
                {filtered.map((c) => {
                  const isActive = c.id === activeId;
                  const name = c.other.name ?? c.other.username ?? 'Member';
                  const preview =
                    c.status === 'pending'
                      ? c.initiatedByMe
                        ? 'Request sent — waiting for them to accept'
                        : (c.lastMessage?.body ?? 'Would like to chat with you')
                      : (c.lastMessage?.body ?? 'Say hello 👋');
                  const time = c.lastMessage?.createdAt
                    ? relativeTime(new Date(c.lastMessage.createdAt))
                    : relativeTime(new Date(c.createdAt));
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectConversation(c.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200',
                        isActive ? 'bg-haven-primary-soft' : 'hover:bg-haven-canvas',
                      )}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: c.other.avatarColor ?? avatarColorFor(name) }}
                        aria-hidden
                      >
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-haven-text">{name}</span>
                            {c.muted && <BellOff size={13} className="shrink-0 text-haven-text-muted" aria-label="Muted" />}
                          </span>
                          <span className="shrink-0 text-xs text-haven-text-muted">{time}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-haven-text-muted">
                          {preview}
                        </span>
                      </span>
                      {c.unread > 0 && (
                        <span
                          className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#C0453B] px-1 text-[11px] font-semibold text-white"
                          aria-label={`${c.unread} unread messages`}
                        >
                          {c.unread > 99 ? '99+' : c.unread}
                        </span>
                      )}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="px-3 py-8 text-center text-[13px] text-haven-text-muted">
                    {query.trim()
                      ? 'No conversations match.'
                      : tab === 'requests'
                        ? 'No requests right now — enjoy the quiet.'
                        : 'No conversations yet. Start one from a member’s profile.'}
                  </p>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Right pane — conversation view */}
        {active ? (
          <section ref={conversationRef} className="flex min-w-0 flex-1 flex-col">
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-haven-border px-5 py-3.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: active.other.avatarColor ?? avatarColorFor(otherName) }}
                aria-hidden
              >
                {otherName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-haven-text">{otherName}</p>
                <p className="text-xs text-haven-text-muted">
                  {activeOtherTyping
                    ? 'typing…'
                    : activeOtherLastActive && Date.now() - activeOtherLastActive < 120000
                      ? 'Active now'
                      : activeOtherLastActive
                        ? `Active ${relativeTime(new Date(activeOtherLastActive))}`
                        : 'Be kind. This is a safe space.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Search messages"
                onClick={() => setSearchOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
              >
                <Search size={16} strokeWidth={1.75} />
              </button>
              <div className="relative shrink-0" ref={headerMenuRef}>
                <button
                  type="button"
                  onClick={() => setHeaderMenuOpen((o) => !o)}
                  aria-label="More options"
                  aria-haspopup="menu"
                  aria-expanded={headerMenuOpen}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                >
                  <MoreHorizontal size={18} strokeWidth={1.75} />
                </button>
                <AnimatePresence>
                  {headerMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      role="menu"
                      className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-haven-border bg-white py-1 shadow-card-hover"
                    >
                      {(
                        [
                          { key: 'profile', label: 'View profile', icon: User },
                          { key: 'select', label: 'Select messages', icon: CheckSquare },
                          { key: 'mute', label: active.muted ? 'Unmute chat' : 'Mute chat', icon: BellOff },
                          { key: 'archive', label: active.archivedAt ? 'Unarchive chat' : 'Archive chat', icon: Archive },
                          { key: 'block', label: 'Block', icon: ShieldBan },
                          { key: 'report', label: 'Report', icon: Flag },
                          { key: 'delete-chat', label: 'Delete chat', icon: Trash2 },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          role="menuitem"
                          onClick={() => headerMenuAction(item.key)}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                        >
                          <item.icon size={15} strokeWidth={1.75} />
                          {item.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </header>
            {otherName === 'Haven Moderation' && emailSenderQ.data && (
              <p className="border-b border-haven-border bg-haven-canvas px-5 py-2 text-center text-[12px] text-haven-text-muted">
                Official moderation emails come only from <span className="font-semibold text-haven-text">{emailSenderQ.data}</span>.
              </p>
            )}
            {searchOpen && (
              <div className="border-b border-haven-border px-5 py-2">
                <input
                  value={messageQuery}
                  onChange={(e) => setMessageQuery(e.target.value)}
                  placeholder="Search messages…"
                  aria-label="Search messages in this chat"
                  className="w-full rounded-full border border-haven-border bg-haven-canvas px-3 py-1.5 text-[13px] text-haven-text outline-none placeholder:text-haven-text-muted focus:ring-2 focus:ring-haven-primary/40"
                />
              </div>
            )}

            {pinnedMessages.length > 0 && (
              <div className="border-b border-haven-border bg-haven-primary-soft/60 px-5 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-haven-primary">Pinned message</p>
                <button
                  type="button"
                  onClick={() => document.getElementById(`message-${pinnedMessages[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="mt-1 block w-full truncate text-left text-[13px] text-haven-text hover:text-haven-primary"
                >
                  {pinnedMessages[0].body}
                </button>
              </div>
            )}

            {/* Messages / request card */}
            {activeIsRequestForMe ? (
              <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-4">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="w-full max-w-md rounded-xl border border-haven-border bg-haven-canvas p-5 text-center"
                >
                  <span
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
                    style={{ backgroundColor: active.other.avatarColor ?? avatarColorFor(otherName) }}
                    aria-hidden
                  >
                    {otherName.charAt(0).toUpperCase()}
                  </span>
                  <h3 className="mt-3 text-[16px] font-semibold text-haven-text">
                    {otherName} would like to chat
                  </h3>
                  {active.requestReason && (
                    <p className="mt-2 text-[13px] italic leading-relaxed text-haven-text-muted">
                      “{active.requestReason}”
                    </p>
                  )}
                  <p className="mt-2 text-sm leading-relaxed text-haven-text-muted">
                    Accept to open the conversation — decline and it quietly goes away.
                  </p>
                  <div className="mt-4 flex justify-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() =>
                        setStatusMutation.mutate({ conversationId: active.id, status: 'accepted' })
                      }
                      disabled={setStatusMutation.isPending}
                      className="rounded-full bg-haven-primary px-6 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-haven-primary-hover disabled:opacity-50"
                    >
                      Accept
                    </motion.button>
                    <button
                      type="button"
                      onClick={() =>
                        setStatusMutation.mutate({ conversationId: active.id, status: 'declined' })
                      }
                      disabled={setStatusMutation.isPending}
                      className="rounded-full border border-haven-border bg-white px-6 py-2 text-sm font-semibold text-haven-text transition-colors duration-200 hover:bg-haven-canvas disabled:opacity-50"
                    >
                      Not now
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-haven-text-muted">
                    Only accept if it feels right. You're in control here.
                  </p>
                </motion.div>
              </div>
            ) : activeAwaitingAcceptance ? (
              <div className="flex flex-1 items-center justify-center px-5 py-4">
                <div className="max-w-sm text-center">
                  <p className="text-xl font-medium text-haven-text">Request sent.</p>
                  <p className="mt-2 text-sm leading-relaxed text-haven-text-muted">
                    {otherName} will see your request in their Requests tab. Once they accept,
                    you can start chatting here.
                  </p>
                </div>
              </div>
            ) : active.status === 'declined' ? (
              <div className="flex flex-1 items-center justify-center px-5 py-4">
                <p className="text-sm text-haven-text-muted">This conversation was declined.</p>
              </div>
            ) : (
              <div ref={scrollRef} role="log" aria-live="polite" aria-label={`Conversation with ${otherName}`} className="scrollbar-calm flex-1 overflow-y-auto px-5 py-4">
                {messagesQ.isError ? (
                  <div className="rounded-xl border border-haven-border bg-white p-5 text-center">
                    <p className="text-[13px] text-haven-text-muted">Messages couldn’t load right now.</p>
                    <button
                      type="button"
                      onClick={() => messagesQ.refetch()}
                      className="mt-3 rounded-full bg-haven-primary px-4 py-1.5 text-[12px] font-semibold text-white"
                    >
                      Try again
                    </button>
                  </div>
                ) : messagesQ.isLoading ? (
                  <div className="space-y-2">
                    {[0, 1].map((i) => (
                      <div key={i} className="h-10 w-2/3 animate-pulse rounded-xl bg-haven-border/30" />
                    ))}
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-haven-text-muted">
                    No messages yet — a gentle hello is a good start.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {messagesQ.hasNextPage && (
                      <button
                        type="button"
                        onClick={() => messagesQ.fetchNextPage()}
                        disabled={messagesQ.isFetchingNextPage}
                        className="mx-auto mb-2 rounded-full border border-haven-border bg-white px-4 py-1.5 text-[12px] font-semibold text-haven-text shadow-card transition-colors hover:border-haven-primary/40 hover:text-haven-primary disabled:opacity-50"
                      >
                        {messagesQ.isFetchingNextPage ? 'Loading older messages…' : 'Load older messages'}
                      </button>
                    )}
                    {filteredMessages.map((m, i) => {
                      const mine = m.senderId === myUserId;
                      const showDay = i === 0 || !isSameDay(filteredMessages[i - 1].createdAt, m.createdAt);
                      return (
                        <div key={m.id}>
                          {showDay && (
                            <div className="my-3 flex justify-center">
                              <span className="rounded-full bg-haven-canvas px-3 py-1 text-[11px] font-medium text-haven-text-muted">
                                {messageDay(m.createdAt)}
                              </span>
                            </div>
                          )}
                        <div
                          className={cn('flex w-fit max-w-[85%] items-center gap-2', mine ? 'ml-auto flex-row-reverse' : 'mr-auto')}
                        >
                          {selecting && (
                            <button
                              type="button"
                              aria-label={selectedIds.has(m.id) ? 'Deselect message' : 'Select message'}
                              aria-pressed={selectedIds.has(m.id)}
                              onClick={() => toggleSelected(m.id)}
                              className={cn(
                                'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                                selectedIds.has(m.id)
                                  ? 'border-haven-primary bg-haven-primary text-white'
                                  : 'border-haven-border bg-white text-transparent',
                              )}
                            >
                              ✓
                            </button>
                          )}
                          <motion.div
                            id={`message-${m.id}`}
                            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: mine ? 0.9 : 1 }}
                            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            transition={reduceMotion ? { duration: 0 } : {
                              duration: 0.3,
                              delay: Math.min(i, 12) * 0.04,
                              ease: EASE,
                              scale: { type: 'spring', stiffness: 320, damping: 22 },
                            }}
                            title={new Date(m.createdAt).toLocaleString()}
                            aria-label={mine ? `Your message at ${messageTime(m.createdAt)}` : `Message from ${otherName} at ${messageTime(m.createdAt)}`}
                            onClick={() => selecting && toggleSelected(m.id)}
                            onContextMenu={(e) => {
                              if (m.deleted || m.id < 0) return;
                              e.preventDefault();
                              const rect = conversationRef.current?.getBoundingClientRect();
                              const menuWidth = 176;
                              const menuHeight = 200;
                              const x = rect
                                ? Math.max(rect.left + 8, Math.min(e.clientX, rect.right - menuWidth - 8))
                                : e.clientX;
                              const y = rect
                                ? Math.max(rect.top + 8, Math.min(e.clientY, rect.bottom - menuHeight - 8))
                                : e.clientY;
                              setContextMenu({ message: m, x, y });
                            }}
                            className={cn(
                              'rounded-xl px-[18px] py-3 text-[15px] leading-relaxed',
                              mine
                                ? 'rounded-br-md bg-haven-primary text-white'
                                : 'rounded-bl-md bg-[#F1F0EC] text-haven-text',
                              selecting && 'cursor-pointer',
                              selectedIds.has(m.id) && 'ring-2 ring-haven-primary/60',
                              highlightMessageId === m.id && 'ring-2 ring-haven-primary/60',
                              m.deleted && 'italic opacity-70',
                            )}
                          >
                            {m.forwardedFromMessageId && (
                              <span className="mb-1 block text-[11px] font-medium italic opacity-70">Forwarded</span>
                            )}
                            {m.replyTo && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHighlightMessageId(m.replyTo!.id);
                                  document.getElementById(`message-${m.replyTo!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  window.setTimeout(() => setHighlightMessageId(null), 5000);
                                }}
                                className="mb-1.5 block w-full rounded-lg border-l-2 border-haven-primary/60 bg-black/5 px-2 py-1 text-left text-[12px] leading-snug opacity-80"
                              >
                                {m.replyTo.body}
                              </button>
                            )}
                            {m.deleted ? 'This message was deleted' : m.body}
                            {m.images && m.images.length > 0 && (
                              <span className="mt-2 grid grid-cols-2 gap-2">
                                {m.images.map((src, index) => (
                                  <img key={index} src={src} alt="Attachment" className="max-h-48 w-full rounded-lg border border-haven-border object-cover" />
                                ))}
                              </span>
                            )}
                            <span className="mt-1 block text-right text-[10px] leading-none opacity-70">
                              {m.editedAt && <span className="mr-1">edited ·</span>}
                              {messageTime(m.createdAt)}
                              {mine && (
                                <span className="ml-1">
                                  {m.readAt ? '· Read' : '· Sent'}
                                </span>
                              )}
                            </span>
                          </motion.div>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Crisis keyword nudge */}
            <AnimatePresence>
              {crisisNudge && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="overflow-hidden border-t border-haven-border bg-haven-warn-soft"
                >
                  <div className="flex items-center gap-2 px-5 py-2.5 text-[13px] text-haven-warn-text">
                    <ShieldAlert size={15} className="shrink-0" />
                    <p>
                      It sounds like things are really hard. Consider reaching out to{' '}
                      <button onClick={() => openCrisis()} className="font-semibold underline underline-offset-2">
                        Crisis support
                      </button>{' '}
                      — trained people are there 24/7.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Composer */}
            <div className="border-t border-haven-border p-4">
              {activeDmClosed ? (
                <p className="rounded-full bg-haven-canvas px-4 py-2.5 text-center text-[13px] text-haven-text-muted">
                  This member isn't accepting messages right now.
                </p>
              ) : active.status !== 'accepted' ? (
                <p className="rounded-full bg-haven-canvas px-4 py-2.5 text-center text-[13px] text-haven-text-muted">
                  {activeAwaitingAcceptance
                    ? 'You can chat once they accept your request.'
                    : active.status === 'pending'
                      ? 'Accept this request to start chatting.'
                      : 'This conversation is closed.'}
                </p>
              ) : (
                <>
                {replyTo && (
                  <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border-l-2 border-haven-primary bg-haven-canvas px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-haven-primary">
                        Replying to {replyTo.senderId === myUserId ? 'yourself' : otherName}
                      </p>
                      <p className="truncate text-[12px] text-haven-text-muted">{replyTo.body}</p>
                    </div>
                    <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="text-haven-text-muted">
                      <X size={14} />
                    </button>
                  </div>
                )}
                {editingId && (
                  <div className="mb-2 flex items-center justify-between rounded-xl bg-haven-canvas px-3 py-2 text-[12px] text-haven-text-muted">
                    <span>Editing your message</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setDraft('');
                      }}
                      className="font-semibold text-haven-primary"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onImagesSelected}
                  />
                  <button
                    type="button"
                    onClick={(e) => e.currentTarget.previousElementSibling?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}
                    aria-label="Add images"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-canvas hover:text-haven-text"
                  >
                    <ImagePlus size={18} strokeWidth={1.75} />
                  </button>
                  {images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {images.map((src, i) => (
                        <span key={i} className="relative">
                          <img src={src} alt="Attachment preview" className="h-12 w-12 rounded-lg border border-haven-border object-cover" />
                          <button
                            type="button"
                            aria-label="Remove image"
                            onClick={() => setImages((current) => current.filter((_, index) => index !== i))}
                            className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-white text-[10px] text-haven-text shadow-card"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="chat-composer"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') send();
                    }}
                    placeholder="Offer support…"
                    aria-label="Message"
                    className="flex-1 rounded-full border border-haven-border bg-haven-canvas px-4 py-2.5 text-sm text-haven-text outline-none placeholder:text-haven-text-muted focus:ring-2 focus:ring-haven-primary/40"
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={send}
                    disabled={!draft.trim() || sendMutation.isPending}
                    aria-label="Send message"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-haven-primary text-white transition-colors duration-200 hover:bg-haven-primary-hover disabled:opacity-40"
                  >
                    <Send size={17} strokeWidth={1.75} />
                  </motion.button>
                </div>
                </>
              )}
            </div>

            {selecting && (
              <div className="flex flex-wrap items-center gap-2 border-t border-haven-border bg-white p-3">
                <span className="text-[13px] font-medium text-haven-text">{selectedIds.size} selected</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(messages.map((m) => m.id)))}
                  className="rounded-full border border-haven-border px-3 py-1 text-[12px] font-semibold text-haven-text"
                >
                  Select all
                </button>
                <button
                  type="button"
                  disabled={selectedIds.size === 0 || deleteMutation.isPending}
                  onClick={() => deleteSelected('me')}
                  className="rounded-full border border-[#C0453B]/30 px-3 py-1 text-[12px] font-semibold text-[#A33B32] disabled:opacity-40"
                >
                  Delete for me
                </button>
                <button
                  type="button"
                  aria-disabled={!canDeleteEveryone}
                  onClick={() => deleteSelected('everyone')}
                  className={cn(
                    'rounded-full bg-[#C0453B] px-3 py-1 text-[12px] font-semibold text-white',
                    (!canDeleteEveryone || selectedIds.size === 0) && 'cursor-not-allowed opacity-40',
                  )}
                >
                  Delete for everyone
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelecting(false);
                    setSelectedIds(new Set());
                  }}
                  aria-label="Cancel message selection"
                  className="ml-auto grid h-7 w-7 place-items-center rounded-full text-haven-text-muted hover:bg-haven-canvas"
                >
                  <X size={15} />
                </button>
                {selectedIds.size > 0 && !canDeleteEveryone && (
                  <p className="w-full text-[11px] text-haven-text-muted">
                    Delete for everyone is only for your own messages within 1 hour.
                  </p>
                )}
              </div>
            )}
          </section>
        ) : (
          /* Empty state — no conversation selected */
          <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <img src="/empty-feed.svg" alt="" className="h-44 w-auto" />
            <h2 className="mt-4 text-2xl font-medium text-haven-text">Choose a conversation</h2>
            <p className="mt-2 max-w-xs text-sm text-haven-text-muted">
              Or start one from a member's profile — a kind message can change a day.
            </p>
          </section>
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {contextMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[1000] w-44 overflow-hidden rounded-xl border border-haven-border bg-white py-1 shadow-card-hover"
              style={{
                left: Math.min(contextMenu.x, window.innerWidth - 190),
                top: Math.min(contextMenu.y, window.innerHeight - 220),
              }}
            >
              {([
                { label: 'Edit', icon: Pencil, action: () => startEditMessage(contextMenu.message) },
                { label: 'Copy', icon: Copy, action: () => copyMessage(contextMenu.message) },
                { label: 'Reply', icon: Reply, action: () => startReplyMessage(contextMenu.message) },
                { label: 'Pin', icon: Pin, action: () => {
                  pinMutation.mutate({ messageId: contextMenu.message.id });
                  setContextMenu(null);
                } },
                { label: contextMenu.message.starred ? 'Unstar' : 'Star', icon: Star, action: () => {
                  starMutation.mutate({ messageId: contextMenu.message.id });
                  setContextMenu(null);
                } },
                { label: 'Forward', icon: Send, action: () => setForwardOpen(true) },
                { label: 'Delete', icon: Trash2, action: () => deleteFromMenu(contextMenu.message) },
              ] as const).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-haven-text transition-colors hover:bg-haven-canvas"
                >
                  <item.icon size={15} strokeWidth={1.75} />
                  {item.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
          {deleteChatOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-haven-text/20 p-4 backdrop-blur-sm"
              onClick={() => setDeleteChatOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                role="dialog"
                aria-modal="true"
                aria-label="Delete chat"
                className="w-full max-w-sm rounded-xl bg-white p-6 shadow-card-hover"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-[18px] font-semibold text-haven-text">Delete this chat?</h3>
                <p className="mt-2 text-sm leading-relaxed text-haven-text-muted">
                  This deletes the conversation for you only. The other member keeps their copy.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteChatOpen(false)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-haven-text-muted hover:bg-haven-canvas"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteChatMutation.isPending}
                    onClick={() => active && deleteChatMutation.mutate({ conversationId: active.id })}
                    className="rounded-full bg-[#C0453B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Delete chat
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
          {muteOpen && active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-haven-text/20 p-4 backdrop-blur-sm"
              onClick={() => setMuteOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                role="dialog"
                aria-modal="true"
                aria-label="Mute chat"
                className="w-full max-w-sm rounded-xl bg-white p-6 shadow-card-hover"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[18px] font-semibold text-haven-text">Mute {otherName}?</h3>
                    <p className="mt-1 text-sm text-haven-text-muted">
                      Choose how long this chat should stop counting toward your unread badge.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close mute options"
                    onClick={() => setMuteOpen(false)}
                    className="grid h-7 w-7 place-items-center rounded-full text-haven-text-muted hover:bg-haven-canvas"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {([
                    ['1h', '1 hour'],
                    ['8h', '8 hours'],
                    ['1d', '1 day'],
                    ['1w', '1 week'],
                    ['always', 'Always'],
                  ] as const).map(([duration, label]) => (
                    <button
                      key={duration}
                      type="button"
                      disabled={muteMutation.isPending}
                      onClick={() => muteMutation.mutate({ conversationId: active.id, duration })}
                      className="rounded-xl border border-haven-border px-4 py-2.5 text-sm font-semibold text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
          {forwardOpen && contextMenu && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-haven-text/20 p-4 backdrop-blur-sm"
              onClick={() => setForwardOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                role="dialog"
                aria-modal="true"
                aria-label="Forward message"
                className="w-full max-w-sm rounded-xl bg-white p-6 shadow-card-hover"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-[18px] font-semibold text-haven-text">Forward message</h3>
                <p className="mt-1 text-sm text-haven-text-muted">Choose a conversation to forward this message to.</p>
                <div className="mt-4 space-y-2">
                  {conversations.filter((c) => c.id !== activeId).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        forwardMutation.mutate({ messageId: contextMenu.message.id, targetConversationId: c.id });
                        setForwardOpen(false);
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl border border-haven-border px-3 py-2 text-left text-sm text-haven-text transition-colors hover:border-haven-primary/40 hover:text-haven-primary"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: c.other.avatarColor ?? '#8B7BC7' }}>
                        {(c.other.name ?? 'M').charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate">{c.other.name ?? c.other.username ?? 'Member'}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <BlockConfirmDialog
        open={blockOpen}
        subject="chat"
        author={otherName}
        pending={blockMutation.isPending}
        onClose={() => setBlockOpen(false)}
        onBlock={() => {
          if (active) blockMutation.mutate({ userId: active.other.userId });
        }}
        onReport={() => {
          setBlockOpen(false);
          setReportOpen(true);
        }}
      />

      <ReportDialog
        open={reportOpen}
        targetLabel={`conversation with ${otherName}`}
        pending={reportMutation.isPending}
        onClose={() => setReportOpen(false)}
        onSubmit={(category: ReportCategory, note: string) => {
          if (!active) return;
          const transcript = messages
            .slice(-12)
            .map((m) => `${m.senderId === myUserId ? 'You' : otherName}: ${m.body}`)
            .join('\n')
            .slice(0, 5000);
          reportMutation.mutate(
            {
              targetType: 'conversation',
              targetId: active.id,
              targetSnapshot: {
                author: otherName,
                title: `Chat conversation with ${otherName}`,
                body: transcript || 'No messages in this conversation.',
              },
              category,
              ...(note ? { context: note } : {}),
            },
            {
              onSuccess: (result) => {
                setReportOpen(false);
                toast(
                  result.duplicate
                    ? 'You already reported this conversation — our moderators have it in hand.'
                    : 'Thanks for letting us know. Our moderators will review this conversation with care.',
                );
              },
            },
          );
        }}
      />
    </div>
  );
}
