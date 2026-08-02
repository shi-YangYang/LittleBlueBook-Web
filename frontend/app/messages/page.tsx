'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { AuthDialog, type AuthenticatedUser } from '../_components/auth-dialog';
import { Avatar } from '../_components/avatar';
import { Icon } from '../_components/icon';
import { PageSidebar } from '../_components/page-chrome';
import { apiRequest, ApiRequestError } from '../_lib/api';
import {
  messageWebSocketUrl,
  publishMessageUnreadCount,
  type ConversationDetailData,
  type ConversationPageData,
  type ConversationSummaryData,
  type DirectMessageData,
  type MessagePageData,
  type MessageRealtimeEvent,
} from '../_lib/messages';
import type { PublicUserProfileData } from '../_lib/search';

function mergeMessages(
  current: DirectMessageData[],
  additions: DirectMessageData[],
): DirectMessageData[] {
  const values = new Map(current.map((message) => [message.id, message]));
  for (const message of additions) values.set(message.id, message);
  return [...values.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime() || left.id.localeCompare(right.id),
  );
}

function MessagesContent() {
  const router = useRouter();
  const query = useSearchParams();
  const requestedConversation = query.get('conversation');
  const requestedUser = query.get('user');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummaryData[]>(
    [],
  );
  const [conversationCursor, setConversationCursor] = useState<string | null>(
    null,
  );
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [listMoreError, setListMoreError] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    requestedConversation,
  );
  const [detail, setDetail] = useState<ConversationDetailData | null>(null);
  const [newTarget, setNewTarget] = useState<PublicUserProfileData | null>(
    null,
  );
  const [messages, setMessages] = useState<DirectMessageData[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [syncCursor, setSyncCursor] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [chatReloadVersion, setChatReloadVersion] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [connectionState, setConnectionState] = useState<
    'connected' | 'reconnecting'
  >('reconnecting');
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [toast, setToast] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const requestIdRef = useRef<string | null>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  const messagesRef = useRef<DirectMessageData[]>([]);
  const syncCursorRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    syncCursorRef.current = syncCursor;
  }, [syncCursor]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const refreshUnread = useCallback(async () => {
    try {
      const result = await apiRequest<{ unreadCount: number }>(
        '/messages/unread-count',
      );
      publishMessageUnreadCount(result.unreadCount);
    } catch {
      // The page keeps its loaded content when unread refresh fails.
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const page = await apiRequest<ConversationPageData>(
      '/messages/conversations?limit=20',
    );
    setConversations(page.items);
    setConversationCursor(page.nextCursor);
  }, []);

  const synchronize = useCallback(async () => {
    const conversationId = selectedIdRef.current;
    const after = syncCursorRef.current;
    if (!conversationId || !after) return;
    let cursor: string | null = after;
    do {
      const page: MessagePageData = await apiRequest<MessagePageData>(
        `/messages/conversations/${conversationId}/messages?after=${encodeURIComponent(cursor)}`,
      );
      if (page.items.length > 0) {
        const merged = mergeMessages(messagesRef.current, page.items);
        messagesRef.current = merged;
        setMessages(merged);
        if (!atBottomRef.current) setHasNewMessage(true);
      }
      cursor = page.syncCursor;
      setSyncCursor(page.syncCursor);
      if (!page.hasMoreAfter) break;
    } while (cursor);
  }, []);

  const advanceVisibleRead = useCallback(async (): Promise<boolean> => {
    if (document.visibilityState !== 'visible') return false;
    const conversationId = selectedIdRef.current;
    if (!conversationId) return false;
    const latestIncoming = [...messagesRef.current]
      .reverse()
      .find(
        (message) => message.conversationId === conversationId && !message.mine,
      );
    if (!latestIncoming || lastMarkedReadRef.current === latestIncoming.id) {
      return false;
    }

    lastMarkedReadRef.current = latestIncoming.id;
    try {
      await apiRequest<{ unreadCount: number }>(
        `/messages/conversations/${conversationId}/read`,
        {
          method: 'PUT',
          body: JSON.stringify({ messageId: latestIncoming.id }),
        },
      );
      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId ? { ...item, unreadCount: 0 } : item,
        ),
      );
      return true;
    } catch (error) {
      if (lastMarkedReadRef.current === latestIncoming.id) {
        lastMarkedReadRef.current = null;
      }
      throw error;
    }
  }, []);

  const recoverVisibleConversation = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    await synchronize().catch(() => undefined);
    await advanceVisibleRead().catch(() => undefined);
    await Promise.allSettled([refreshConversations(), refreshUnread()]);
  }, [advanceVisibleRead, refreshConversations, refreshUnread, synchronize]);

  useEffect(() => {
    let active = true;
    void apiRequest<{
      authenticated: boolean;
      user: AuthenticatedUser | null;
    }>('/auth/session')
      .then((session) => {
        if (!active) return;
        if (session.authenticated && session.user) setUser(session.user);
        else setAuthOpen(true);
      })
      .catch(() => {
        if (active) setAuthOpen(true);
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setListLoading(true);
      setListError(false);
      void refreshConversations()
        .catch(() => {
          if (active) setListError(true);
        })
        .finally(() => {
          if (active) setListLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [refreshConversations, user]);

  useEffect(() => {
    if (!user || !requestedUser || selectedId) {
      queueMicrotask(() => setNewTarget(null));
      return;
    }
    const controller = new AbortController();
    void apiRequest<PublicUserProfileData>(
      `/users/${encodeURIComponent(requestedUser)}/profile`,
      { signal: controller.signal },
    )
      .then((profile) => setNewTarget(profile.viewer.isSelf ? null : profile))
      .catch(() => setToast('私信目标不存在'));
    return () => controller.abort();
  }, [requestedUser, selectedId, user]);

  useEffect(() => {
    if (!user || !selectedId) {
      queueMicrotask(() => {
        setDetail(null);
        messagesRef.current = [];
        setMessages([]);
        setHistoryCursor(null);
        setSyncCursor(null);
      });
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setChatLoading(true);
      setChatError(false);
      setHistoryError(false);
      messagesRef.current = [];
      setMessages([]);
      setHistoryCursor(null);
      setSyncCursor(null);
      lastMarkedReadRef.current = null;
      void Promise.all([
        apiRequest<ConversationDetailData>(
          `/messages/conversations/${selectedId}`,
          { signal: controller.signal },
        ),
        apiRequest<MessagePageData>(
          `/messages/conversations/${selectedId}/messages`,
          { signal: controller.signal },
        ),
      ])
        .then(([metadata, page]) => {
          if (controller.signal.aborted) return;
          setDetail(metadata);
          messagesRef.current = page.items;
          setMessages(page.items);
          setHistoryCursor(page.nextCursor);
          setSyncCursor(page.syncCursor);
          atBottomRef.current = true;
        })
        .catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setChatError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setChatLoading(false);
        });
    });
    return () => controller.abort();
  }, [chatReloadVersion, selectedId, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let socket: WebSocket | null = null;
    const connect = () => {
      if (!active) return;
      setConnectionState('reconnecting');
      socket = new WebSocket(messageWebSocketUrl());
      socket.addEventListener('open', () => {
        setConnectionState('connected');
        void recoverVisibleConversation();
      });
      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(
            String(event.data),
          ) as MessageRealtimeEvent;
          if (payload.type === 'message.created') {
            const raw = payload.data.message as
              Partial<DirectMessageData> | undefined;
            if (
              raw?.id &&
              raw.conversationId &&
              raw.senderId &&
              raw.content !== undefined &&
              raw.createdAt
            ) {
              if (raw.conversationId === selectedIdRef.current) {
                const item: DirectMessageData = {
                  id: raw.id,
                  conversationId: raw.conversationId,
                  senderId: raw.senderId,
                  content: raw.content,
                  createdAt: raw.createdAt,
                  mine: raw.senderId === user.id,
                  read: false,
                };
                const merged = mergeMessages(messagesRef.current, [item]);
                messagesRef.current = merged;
                setMessages(merged);
                if (!atBottomRef.current) setHasNewMessage(true);
                void synchronize().catch(() => undefined);
              }
              void refreshConversations().catch(() => undefined);
              void refreshUnread();
            }
          } else if (payload.type === 'read.updated') {
            const messageId = payload.data.messageId;
            const readerId = payload.data.readerId;
            if (
              typeof messageId === 'string' &&
              typeof readerId === 'string' &&
              readerId !== user.id
            ) {
              setMessages((current) => {
                const boundary = current.findIndex(
                  (item) => item.id === messageId,
                );
                const updated =
                  boundary < 0
                    ? current
                    : current.map((item, index) =>
                        item.mine && index <= boundary
                          ? { ...item, read: true }
                          : item,
                      );
                messagesRef.current = updated;
                return updated;
              });
            }
          } else if (
            payload.type === 'unread.updated' &&
            typeof payload.data.unreadCount === 'number'
          ) {
            publishMessageUnreadCount(payload.data.unreadCount);
          }
        } catch {
          // HTTP synchronization is the recovery path for malformed events.
        }
      });
      socket.addEventListener('close', () => {
        if (!active) return;
        setConnectionState('reconnecting');
        reconnectTimerRef.current = window.setTimeout(connect, 1500);
      });
    };
    connect();
    return () => {
      active = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socket?.close();
    };
  }, [
    recoverVisibleConversation,
    refreshConversations,
    refreshUnread,
    synchronize,
    user,
  ]);

  useEffect(() => {
    const recover = () => {
      if (document.visibilityState !== 'visible') return;
      void recoverVisibleConversation();
    };
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [recoverVisibleConversation]);

  useLayoutEffect(() => {
    const element = historyRef.current;
    if (!element || !atBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
    setHasNewMessage(false);
  }, [messages]);

  useEffect(() => {
    if (
      !selectedId ||
      document.visibilityState !== 'visible' ||
      chatLoading ||
      chatError
    ) {
      return;
    }
    void advanceVisibleRead()
      .then((advanced) => {
        if (advanced) void refreshUnread();
      })
      .catch(() => undefined);
  }, [
    advanceVisibleRead,
    chatError,
    chatLoading,
    messages,
    refreshUnread,
    selectedId,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectConversation = (conversationId: string) => {
    setSelectedId(conversationId);
    setNewTarget(null);
    router.replace(
      `/messages?conversation=${encodeURIComponent(conversationId)}`,
    );
  };

  const retryConversationList = async () => {
    setListLoading(true);
    setListError(false);
    try {
      await refreshConversations();
    } catch {
      setListError(true);
    } finally {
      setListLoading(false);
    }
  };

  const loadMoreConversations = async () => {
    if (!conversationCursor || listLoadingMore) return;
    setListLoadingMore(true);
    setListMoreError(false);
    try {
      const page = await apiRequest<ConversationPageData>(
        `/messages/conversations?limit=20&cursor=${encodeURIComponent(conversationCursor)}`,
      );
      setConversations((current) => {
        const known = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...page.items.filter((item) => !known.has(item.id)),
        ];
      });
      setConversationCursor(page.nextCursor);
    } catch {
      setListMoreError(true);
    } finally {
      setListLoadingMore(false);
    }
  };

  const loadEarlier = async () => {
    if (!selectedId || !historyCursor || historyLoading) return;
    const element = historyRef.current;
    const previousHeight = element?.scrollHeight ?? 0;
    const previousTop = element?.scrollTop ?? 0;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const page = await apiRequest<MessagePageData>(
        `/messages/conversations/${selectedId}/messages?cursor=${encodeURIComponent(historyCursor)}`,
      );
      const merged = mergeMessages(page.items, messagesRef.current);
      messagesRef.current = merged;
      setMessages(merged);
      setHistoryCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (element)
          element.scrollTop =
            previousTop + element.scrollHeight - previousHeight;
      });
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    const length = Array.from(content).length;
    setSendError('');
    if (length < 1 || length > 1000) {
      setSendError('私信需为1～1000个字符');
      return;
    }
    const canSend = detail?.canSend ?? newTarget?.viewer.canMessage ?? false;
    if (!canSend || sending) return;
    setSending(true);
    requestIdRef.current ??= crypto.randomUUID();
    try {
      const result = await apiRequest<{
        conversationId: string;
        message: DirectMessageData;
      }>(
        selectedId
          ? `/messages/conversations/${selectedId}/messages`
          : `/messages/users/${newTarget!.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            content,
            clientRequestId: requestIdRef.current,
          }),
        },
      );
      atBottomRef.current = true;
      const merged = mergeMessages(messagesRef.current, [result.message]);
      messagesRef.current = merged;
      setMessages(merged);
      setDraft('');
      requestIdRef.current = null;
      if (!selectedId) selectConversation(result.conversationId);
      await refreshConversations();
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.payload.code === 'MUTUAL_FOLLOW_REQUIRED'
      ) {
        setDetail((current) =>
          current ? { ...current, canSend: false } : current,
        );
        setSendError('已取消互关，历史仍可查看；重新互关后可继续私信');
      } else {
        setSendError('发送失败，草稿已保留，请重试');
      }
    } finally {
      setSending(false);
    }
  };

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const opponent =
    detail?.opponent ??
    (newTarget
      ? {
          id: newTarget.id,
          nickname: newTarget.nickname,
          avatar: newTarget.avatar,
        }
      : null);
  const canSend = detail?.canSend ?? newTarget?.viewer.canMessage ?? false;
  const draftLength = Array.from(draft).length;
  const latestMineId = [...messages]
    .reverse()
    .find((message) => message.mine)?.id;

  return (
    <div className="home-shell messages-shell">
      <PageSidebar
        user={user}
        active="messages"
        onLogin={() => setAuthOpen(true)}
        onToast={setToast}
      />
      <main className="messages-page" aria-labelledby="messages-title">
        <header className="messages-page-heading">
          <div>
            <p>一对一沟通</p>
            <h1 id="messages-title">私信</h1>
          </div>
          <span role="status">
            {connectionState === 'connected' ? '已连接' : '正在重连'}
          </span>
        </header>
        <div
          className={`messages-layout ${opponent ? 'messages-mobile-chat' : ''}`}
        >
          <section className="conversation-panel" aria-label="会话列表">
            {sessionLoading || listLoading ? (
              <div className="message-state" aria-busy="true">
                正在加载会话…
              </div>
            ) : listError ? (
              <div className="message-state" role="alert">
                <p>会话加载失败</p>
                <button
                  type="button"
                  onClick={() => void retryConversationList()}
                >
                  重试
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="message-state">
                <Icon name="message" size={46} />
                <p>暂时没有私信，去互关用户的主页发起会话吧</p>
              </div>
            ) : (
              <ul className="conversation-list">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      className={
                        selectedId === conversation.id ? 'selected' : ''
                      }
                      aria-current={
                        selectedId === conversation.id ? 'true' : undefined
                      }
                      onClick={() => selectConversation(conversation.id)}
                    >
                      <Avatar
                        avatar={conversation.opponent.avatar}
                        className="conversation-avatar"
                      />
                      <span>
                        <strong>{conversation.opponent.nickname}</strong>
                        <small>{conversation.lastMessage.content}</small>
                      </span>
                      <time dateTime={conversation.lastMessage.createdAt}>
                        {new Date(
                          conversation.lastMessage.createdAt,
                        ).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {conversation.unreadCount > 0 ? (
                        <em aria-label={`${conversation.unreadCount} 条未读`}>
                          {conversation.unreadCount > 99
                            ? '99+'
                            : conversation.unreadCount}
                        </em>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {conversationCursor ? (
              <div className="conversation-more">
                {listMoreError ? <span role="alert">加载失败</span> : null}
                <button
                  type="button"
                  disabled={listLoadingMore}
                  onClick={() => void loadMoreConversations()}
                >
                  {listLoadingMore ? '加载中…' : '加载更多'}
                </button>
              </div>
            ) : null}
          </section>

          <section className="chat-panel" aria-label="聊天区">
            {!opponent ? (
              <div className="message-state chat-empty">
                <Icon name="message" size={54} />
                <p>选择一个会话开始聊天</p>
              </div>
            ) : (
              <>
                <header className="chat-heading">
                  <button
                    className="chat-mobile-back"
                    type="button"
                    aria-label="返回会话列表"
                    onClick={() => {
                      setSelectedId(null);
                      setNewTarget(null);
                      router.replace('/messages');
                    }}
                  >
                    <Icon name="chevronLeft" />
                  </button>
                  <Avatar
                    avatar={opponent.avatar}
                    className="conversation-avatar"
                  />
                  <div>
                    <strong>{opponent.nickname}</strong>
                    <span>
                      {canSend ? '互相关注，可发送私信' : '互相关注后可私信'}
                    </span>
                  </div>
                </header>
                <div
                  className="message-history"
                  ref={historyRef}
                  tabIndex={0}
                  aria-label={`与${opponent.nickname}的聊天记录`}
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    atBottomRef.current =
                      element.scrollHeight -
                        element.scrollTop -
                        element.clientHeight <
                      48;
                    if (atBottomRef.current) setHasNewMessage(false);
                  }}
                >
                  {chatLoading ? (
                    <div className="message-state" aria-busy="true">
                      正在加载消息…
                    </div>
                  ) : chatError ? (
                    <div className="message-state" role="alert">
                      <p>消息加载失败</p>
                      <button
                        type="button"
                        onClick={() =>
                          setChatReloadVersion((version) => version + 1)
                        }
                      >
                        重试
                      </button>
                    </div>
                  ) : (
                    <>
                      {historyCursor ? (
                        <div className="history-more">
                          {historyError ? (
                            <span role="alert">加载失败，现有消息已保留</span>
                          ) : null}
                          <button
                            type="button"
                            disabled={historyLoading}
                            onClick={() => void loadEarlier()}
                          >
                            {historyLoading ? '加载中…' : '加载更早消息'}
                          </button>
                        </div>
                      ) : null}
                      {messages.length === 0 ? (
                        <div className="message-state">
                          还没有消息，发送第一条吧
                        </div>
                      ) : (
                        <ol className="message-list">
                          {messages.map((message) => (
                            <li
                              className={message.mine ? 'mine' : 'theirs'}
                              key={message.id}
                            >
                              <p>{message.content}</p>
                              <span>
                                <time dateTime={message.createdAt}>
                                  {new Date(
                                    message.createdAt,
                                  ).toLocaleTimeString('zh-CN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </time>
                                {message.mine && message.id === latestMineId
                                  ? message.read
                                    ? '· 已读'
                                    : '· 未读'
                                  : ''}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </>
                  )}
                </div>
                {hasNewMessage ? (
                  <button
                    className="new-message-jump"
                    type="button"
                    onClick={() => {
                      atBottomRef.current = true;
                      const element = historyRef.current;
                      if (element) element.scrollTop = element.scrollHeight;
                      setHasNewMessage(false);
                    }}
                  >
                    有新消息
                  </button>
                ) : null}
                <form
                  className="message-composer"
                  onSubmit={(event) => void send(event)}
                >
                  {!canSend ? <p>当前不可发送：互相关注后可私信</p> : null}
                  <label htmlFor="message-draft">消息内容</label>
                  <textarea
                    id="message-draft"
                    value={draft}
                    disabled={!canSend || sending}
                    maxLength={2000}
                    aria-invalid={draftLength > 1000}
                    aria-describedby="message-status"
                    onChange={(event) => {
                      setDraft(event.target.value);
                      requestIdRef.current = null;
                      setSendError('');
                    }}
                    onKeyDown={handleComposerKey}
                  />
                  <div id="message-status" aria-live="polite">
                    <span className={draftLength > 1000 ? 'invalid' : ''}>
                      {draftLength}/1000
                    </span>
                    <button
                      type="submit"
                      disabled={
                        !canSend ||
                        sending ||
                        draftLength < 1 ||
                        draftLength > 1000
                      }
                    >
                      {sending ? '发送中…' : '发送'}
                    </button>
                  </div>
                  {sendError ? <p role="alert">{sendError}</p> : null}
                </form>
              </>
            )}
          </section>
        </div>
      </main>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setAuthOpen(false);
        }}
        onToast={setToast}
      />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<main className="message-state">正在加载私信…</main>}>
      <MessagesContent />
    </Suspense>
  );
}
