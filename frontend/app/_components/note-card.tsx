/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';

import { markNoteDetailSource, type NoteCardData } from '../_lib/notes';
import { Icon } from './icon';

export function NoteCard({ note }: { note: NoteCardData }) {
  const aspectRatio =
    note.cover.width > 0 && note.cover.height > 0
      ? `${note.cover.width} / ${note.cover.height}`
      : '4 / 5';

  return (
    <article className="note-card" data-note-id={note.id}>
      <Link
        className="card-action"
        href={`/explore/${note.id}`}
        aria-label={`查看笔记：${note.title}`}
        onNavigate={() => markNoteDetailSource(note.id)}
      >
        <span className="cover-wrap" style={{ aspectRatio }}>
          <img src={note.cover.url} alt="" loading="lazy" />
        </span>
        <span className="card-title">{note.title}</span>
        <span className="card-meta">
          <span className="author">
            <span className="author-avatar" aria-hidden="true">
              {note.author.avatar.value}
            </span>
            <span>{note.author.nickname}</span>
          </span>
          <span className="likes" aria-label={`点赞 ${note.likes}`}>
            <Icon name="heart" size={17} />
            {note.likes}
          </span>
        </span>
      </Link>
    </article>
  );
}
