/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useState } from 'react';

import { apiRequest, ApiRequestError } from '../_lib/api';
import { markNoteDetailSource, type NoteCardData } from '../_lib/notes';
import { Icon } from './icon';
import { Avatar } from './avatar';
import { NoteManageMenu } from './note-manage-menu';

type NoteCardProps = {
  note: NoteCardData;
  onAuthenticationRequired?: (resume: () => Promise<void>) => void;
  onLikeChanged?: (
    noteId: string,
    result: { active: boolean; count: number },
  ) => void;
  onInteractionError?: (message: string) => void;
  onDeleted?: (noteId: string) => void;
};

const FEED_CARD_COVER_ASPECT_RATIO = '4 / 3';

export function NoteCard({
  note,
  onAuthenticationRequired,
  onLikeChanged,
  onInteractionError,
  onDeleted,
}: NoteCardProps) {
  const [liked, setLiked] = useState(note.liked);
  const [likes, setLikes] = useState(note.likes);
  const [canLike, setCanLike] = useState(note.canLike);
  const [busy, setBusy] = useState(false);
  const duration = note.videoDurationMs
    ? `${Math.floor(note.videoDurationMs / 60_000)}:${String(
        Math.floor(note.videoDurationMs / 1000) % 60,
      ).padStart(2, '0')}`
    : null;

  const setLike = async (target: boolean, canRequestAuthentication = true) => {
    if (busy || !canLike) return;
    const previous = { liked, likes };
    setBusy(true);
    setLiked(target);
    setLikes((value) => Math.max(0, value + (target ? 1 : -1)));
    try {
      const result = await apiRequest<{ active: boolean; count: number }>(
        `/notes/${note.id}/like`,
        { method: target ? 'PUT' : 'DELETE' },
      );
      setLiked(result.active);
      setLikes(result.count);
      onLikeChanged?.(note.id, result);
    } catch (error) {
      setLiked(previous.liked);
      setLikes(previous.likes);
      if (
        canRequestAuthentication &&
        error instanceof ApiRequestError &&
        error.status === 401 &&
        onAuthenticationRequired
      ) {
        onAuthenticationRequired(() => setLike(target, false));
      } else if (
        error instanceof ApiRequestError &&
        error.payload.code === 'SELF_LIKE_NOT_ALLOWED'
      ) {
        setCanLike(false);
        onInteractionError?.('不能点赞自己的笔记');
      } else {
        onInteractionError?.('点赞操作失败，请稍后重试');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="note-card" data-note-id={note.id}>
      {note.management ? (
        <NoteManageMenu
          noteId={note.id}
          contentVersion={note.management.contentVersion}
          onDeleted={onDeleted}
        />
      ) : null}
      <Link
        className="card-action"
        href={`/explore/${note.id}`}
        aria-label={`查看笔记：${note.title}`}
        onNavigate={() => markNoteDetailSource(note.id)}
      >
        <span
          className="cover-wrap"
          style={{ aspectRatio: FEED_CARD_COVER_ASPECT_RATIO }}
        >
          <img src={note.cover.url} alt="" loading="lazy" />
          {note.contentType === 'VIDEO' ? (
            <>
              <span
                className="video-play-indicator"
                aria-label={`视频${duration ? `，时长${duration}` : ''}`}
              />
              {duration ? (
                <span className="video-duration" aria-hidden="true">
                  {duration}
                </span>
              ) : null}
            </>
          ) : null}
        </span>
        <span className="card-title">{note.title}</span>
      </Link>
      <div className="card-meta">
        <Link
          className="author"
          href={`/explore/${note.id}`}
          onNavigate={() => markNoteDetailSource(note.id)}
        >
          <Avatar avatar={note.author.avatar} className="author-avatar" />
          <span>{note.author.nickname}</span>
        </Link>
        <span
          className="note-views"
          aria-label={`浏览量 ${note.views}`}
          title={`浏览量 ${note.views}`}
        >
          <Icon name="eye" size={16} />
          <span>{note.views}</span>
        </span>
        <button
          className={`likes ${liked ? 'selected' : ''}`}
          type="button"
          disabled={busy || !canLike}
          aria-pressed={liked}
          aria-label={
            canLike
              ? `${liked ? '取消点赞' : '点赞'}，当前 ${likes}`
              : `自己的笔记不可点赞，当前 ${likes}`
          }
          title={canLike ? undefined : '不能点赞自己的笔记'}
          onClick={() => void setLike(!liked)}
        >
          <Icon name="heart" size={17} />
          <span>{likes}</span>
        </button>
      </div>
    </article>
  );
}
