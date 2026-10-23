import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, User } from '../types';
import { PlayerAvatar } from './PlayerAvatar';
import { Badge } from './Ui';

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ChatPanel({
  messages,
  user,
  onSend,
  connected,
}: {
  messages: ChatMessage[];
  user: User;
  onSend: (text: string) => Promise<boolean>;
  connected: boolean;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages.length]);

  const submit = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    const ok = await onSend(value);
    setSending(false);
    if (ok) setText('');
  };

  return (
    <div className="chat-panel">
      <div className="panel-subhead">
        <span>Table chat</span>
        <span className="muted">{messages.length ? `${messages.length} messages` : 'Say hello'}</span>
      </div>
      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">A little table talk makes the hive buzz.</p>
        ) : (
          messages.map((message) => {
            const own = message.userId === user.id;
            return (
              <div className={`chat-row ${own ? 'is-own' : ''}`} key={message.id}>
                <PlayerAvatar name={message.username} size={28} isGuest={message.isGuest} />
                <div className="chat-bubble-wrap">
                  <div className="chat-meta">
                    <strong>{own ? 'You' : message.username}</strong>
                    {message.isGuest ? <Badge tone="muted">Guest</Badge> : null}
                    <span>{timeLabel(message.at)}</span>
                  </div>
                  <div className="chat-bubble">{message.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={280}
          placeholder={connected ? 'Message the table…' : 'Reconnecting…'}
          aria-label="Chat message"
          disabled={!connected}
        />
        <button type="submit" className="chat-send" disabled={!text.trim() || sending || !connected}>
          Send
        </button>
      </form>
    </div>
  );
}
