import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Info,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { useCareScript } from '../../context/CareScriptContext';
import { sendAiBuddyMessage } from '../../services/aiService';
import { formatIsoTime } from '../../utils/dateUtils';

export const AIBuddy: React.FC = () => {
  const {
    session,
    profile,
    prescriptions,
    reminders,
    chatMessages,
    addChatMessage,
    clearChat,
    t,
  } = useCareScript();

  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, loading]);

  // Reset active conversation ID when signed-in account changes
  useEffect(() => {
    setConversationId(null);
  }, [session.firebaseUid, session.isDemoAccount]);

  const suggestedQuestions = [
    t.aiBuddy.q1,
    t.aiBuddy.q2,
    t.aiBuddy.q3,
    t.aiBuddy.q4,
  ];

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) {
      setInputError('Please enter a question before sending.');
      return;
    }
    if (loading) return;

    setInputError('');
    if (!overrideText) setInput('');

    addChatMessage({
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
    });

    setLoading(true);
    try {
      const response = await sendAiBuddyMessage(text, {
        patientName: profile.fullName,
        prescriptions,
        reminders,
        isDemoAccount: session.isDemoAccount,
        conversationId,
      });

      if (response.conversationId) {
        setConversationId(response.conversationId);
      }

      addChatMessage({
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: response.text,
        timestamp: new Date().toISOString(),
        isDemo: response.isDemo,
      });
    } catch (err) {
      addChatMessage({
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text:
          err instanceof Error
            ? err.message
            : 'Sorry, I could not process your question right now. Please try again in a moment.',
        timestamp: new Date().toISOString(),
        isError: true,
        retryPrompt: text,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <section className="cs-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: 'var(--color-purple)' }}
          >
            <Bot className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{t.aiBuddy.title}</h1>
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1"
                style={{ backgroundColor: 'var(--color-light-purple)', color: 'var(--color-purple)' }}
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                {t.aiBuddy.assistantName}
              </span>
            </div>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Plain-language prescription explanations &amp; general medication education (Demo Companion Mode when Gemini API backend is offline).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setConversationId(null);
            clearChat();
          }}
          className="cs-btn-secondary px-3.5 py-2 text-xs inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          New Chat
        </button>
      </section>

      {/* Suggested Questions */}
      <section aria-label={t.aiBuddy.suggestedTitle}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-2.5 px-1" style={{ color: 'var(--color-text-muted)' }}>
          {t.aiBuddy.suggestedTitle}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => handleSend(q)}
              className="cs-card p-3.5 text-left text-sm font-semibold hover:border-[var(--color-purple)] transition-colors flex items-center gap-2.5"
            >
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--color-purple)' }} aria-hidden="true" />
              <span>{q}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Chat Panel */}
      <section className="cs-card flex flex-col h-[520px] sm:h-[560px] overflow-hidden">
        {/* Subtle Safety Disclaimer */}
        <div
          className="px-4 py-2.5 border-b flex items-center gap-2 text-xs"
          style={{
            backgroundColor: 'var(--color-light-purple)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--color-purple)' }} aria-hidden="true" />
          <span>{t.aiBuddy.disclaimer}</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {chatMessages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: msg.isError ? 'var(--color-danger)' : 'var(--color-purple)' }}
                    aria-hidden="true"
                  >
                    {msg.isError ? <AlertCircle className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                )}

                <div
                  className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line"
                  style={{
                    backgroundColor: isUser
                      ? 'var(--color-primary)'
                      : msg.isError
                      ? 'var(--color-danger-bg)'
                      : 'var(--color-light-purple)',
                    color: isUser ? '#FFFFFF' : msg.isError ? 'var(--color-danger)' : 'var(--color-text)',
                  }}
                >
                  <div>{msg.text}</div>
                  <div
                    className="mt-1.5 flex items-center justify-between gap-3 text-[11px] opacity-80"
                  >
                    <span>{formatIsoTime(msg.timestamp)}</span>
                    {!isUser && msg.isError && msg.retryPrompt && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleSend(msg.retryPrompt)}
                        className="inline-flex items-center gap-1 font-bold underline"
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        Retry
                      </button>
                    )}
                    {!isUser && msg.isDemo && (
                      <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--color-purple)' }}>
                        <Info className="w-3 h-3" aria-hidden="true" />
                        Demo Response
                      </span>
                    )}
                  </div>
                </div>

                {isUser && (
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }}
                    aria-hidden="true"
                  >
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex items-end gap-2.5 justify-start">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: 'var(--color-purple)' }}
              >
                <Bot className="w-4 h-4" />
              </div>
              <div
                className="rounded-2xl px-4 py-3 text-sm flex items-center gap-2"
                style={{ backgroundColor: 'var(--color-light-purple)', color: 'var(--color-text-muted)' }}
              >
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-purple)' }} />
                CareScript AI Buddy is thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 sm:p-4 border-t"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          {inputError && (
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-danger)' }}>
              {inputError}
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              className="cs-input flex-1 text-sm sm:text-base"
              placeholder={t.aiBuddy.placeholder}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (inputError) setInputError('');
              }}
              aria-label="Message CareScript AI Buddy"
            />
            <button
              type="submit"
              disabled={loading}
              className="cs-btn-purple px-4 sm:px-5 py-3 text-sm inline-flex items-center gap-2 shrink-0"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t.aiBuddy.send}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
