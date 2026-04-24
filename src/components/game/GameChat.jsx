// Chat temps réel par partie.
// Utilise la sous-collection Firestore games/{gameId}/chat/{messageId}.
// Les règles Firestore autorisent déjà la lecture/création dans cette sous-collection.

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../contexts/ToastContext'
import {
  collection, query, orderBy, limitToLast,
  onSnapshot, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'

const MAX_MESSAGES = 20
const MAX_LENGTH   = 200

export default function GameChat({ gameId, currentUserId, displayName }) {
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const bottomRef                 = useRef(null)
  const { t }                     = useTranslation()
  const toast                     = useToast()

  // S'abonner aux derniers messages en temps réel
  useEffect(() => {
    if (!gameId) return
    const q = query(
      collection(db, 'games', gameId, 'chat'),
      orderBy('createdAt', 'asc'),
      limitToLast(MAX_MESSAGES),
    )
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [gameId])

  // Scroller automatiquement vers le bas à chaque nouveau message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setInput('')
    try {
      await addDoc(collection(db, 'games', gameId, 'chat'), {
        userId:      currentUserId,
        displayName: displayName ?? 'Player',
        text,
        createdAt:   serverTimestamp(),
      })
    } catch (err) {
      console.error('Chat send failed:', err)
      toast.error(err?.message ?? t('common.actionFailed'))
      // Remettre le texte si l'envoi échoue
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 flex flex-col">
      <p className="text-slate-500 text-xs px-3 pt-2 pb-1 uppercase tracking-wide">{t('chat.title')}</p>

      {/* Liste des messages */}
      <div className="flex flex-col gap-1 px-3 pb-2 max-h-40 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-slate-600 text-xs italic">{t('chat.noMessages')}</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.userId === currentUserId
          return (
            <div key={msg.id} className={`text-xs flex gap-1.5 ${isMe ? 'justify-end' : ''}`}>
              {!isMe && (
                <span className="text-slate-500 flex-shrink-0 font-medium">{msg.displayName}:</span>
              )}
              <span className={`break-words max-w-[75%] ${isMe ? 'text-emerald-300' : 'text-slate-300'}`}>
                {msg.text}
              </span>
            </div>
          )
        })}
        {/* Ancre pour le scroll automatique */}
        <div ref={bottomRef} />
      </div>

      {/* Champ de saisie */}
      <form onSubmit={handleSend} className="flex gap-2 px-2 pb-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.slice(0, MAX_LENGTH))}
          placeholder={t('chat.placeholder')}
          disabled={sending}
          className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {t('chat.send')}
        </button>
      </form>
    </div>
  )
}
