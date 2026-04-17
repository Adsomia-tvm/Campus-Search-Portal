import { useState, useRef, useEffect } from 'react';
import api from '../../api';

export default function BotTest() {
  const [phone, setPhone] = useState('9876543210');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg, time: new Date() }]);
    setLoading(true);

    try {
      const { data } = await api.post('/bot/test', { phone, message: userMsg });
      setMessages(prev => [...prev, { role: 'bot', text: data.reply, time: new Date() }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: '⚠️ Error: ' + (err.response?.data?.error || err.message), time: new Date(), error: true }]);
    } finally {
      setLoading(false);
    }
  };

  const quickSend = (text) => {
    setInput(text);
    setTimeout(() => {
      const form = document.getElementById('bot-form');
      if (form) form.requestSubmit();
    }, 50);
  };

  const clearChat = () => {
    setMessages([]);
    quickSend('hi');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🤖 WhatsApp Bot Tester</h1>
          <p className="text-sm text-gray-500">Test all bot flows without WhatsApp. Messages use the same bot engine.</p>
        </div>
        <button onClick={clearChat} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
          Reset Chat
        </button>
      </div>

      {/* Phone number */}
      <div className="mb-3 flex items-center gap-2 bg-white border rounded-lg p-2">
        <span className="text-sm text-gray-500 whitespace-nowrap">Test phone:</span>
        <input
          type="text"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="flex-1 text-sm border-0 focus:ring-0 p-0"
          placeholder="10-digit phone"
        />
      </div>

      {/* Chat area */}
      <div
        ref={chatRef}
        className="bg-[#e5ddd5] border rounded-xl p-4 h-[500px] overflow-y-auto space-y-3"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23c8c3bc\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
      >
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-4xl mb-2">💬</p>
            <p className="text-sm">Send <strong>HI</strong> to start a conversation</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[#dcf8c6] text-gray-900'
                  : msg.error
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-white text-gray-900'
              }`}
            >
              {msg.role === 'bot' && <div className="text-[10px] text-green-600 font-bold mb-0.5">Campus Search Bot</div>}
              <div>{formatBotText(msg.text)}</div>
              <div className="text-[10px] text-gray-400 text-right mt-0.5">
                {msg.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg px-4 py-2 text-sm shadow-sm text-gray-400">
              <span className="animate-pulse">typing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {['HI', '1', '2', '3', '4', 'Agent', 'Help', 'Back', 'Menu'].map(q => (
          <button
            key={q}
            onClick={() => quickSend(q)}
            className="px-2.5 py-1 text-xs bg-white border rounded-full hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form id="bot-form" onSubmit={sendMessage} className="mt-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 border rounded-full px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-300 focus:border-green-400"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}

// Format bot text: make *bold* and preserve line breaks
function formatBotText(text) {
  if (!text) return '';
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i}>{part.slice(1, -1)}</strong>;
    }
    return part;
  });
}
