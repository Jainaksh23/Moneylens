import React from 'react';
import { BookCheck, ShieldAlert } from 'lucide-react';

export const ChatPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">AI Financial Education Assistant</h1>
        <p className="text-sm text-gray-400 mt-1">
          Grounded conversational intelligence backed by approved markdown knowledge and computed facts.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-300 flex items-start space-x-3">
        <ShieldAlert className="h-5 w-5 flex-shrink-0 text-amber-400" />
        <div>
          <strong className="font-semibold">Educational Boundary:</strong> The assistant only explains computed financial facts and verified educational documents in <code className="text-amber-200">rag/knowledge/</code>. It cannot generate speculative investment advice.
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800 text-gray-400">
          <BookCheck className="h-6 w-6 text-emerald-400" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-gray-200">RAG Knowledge Base & LLM Gateway</h3>
        <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
          Vector indexing through ChromaDB and the Groq LLM integration pipeline will be implemented in subsequent phases.
        </p>
      </div>
    </div>
  );
};
