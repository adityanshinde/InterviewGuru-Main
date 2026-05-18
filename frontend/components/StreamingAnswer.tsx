import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

export interface StreamingAnswerProps {
  text: string;
  isStreaming?: boolean;
  speed?: 'slow' | 'normal' | 'fast' | 'instant';
  showCursor?: boolean;
  cursorChar?: string;
  className?: string;
  onComplete?: () => void;
  renderToken?: (token: string, index: number) => ReactNode;
}

export interface AnswerSection {
  title: string;
  content: string;
  points?: string[];
}

export interface StructuredAnswerProps {
  sections?: AnswerSection[];
  explanation?: string;
  code?: string;
  codeLanguage?: string;
  bullets?: string[];
  spoken?: string;
  isStreaming?: boolean;
  streamingText?: string;
  className?: string;
}

// ════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════

const SPEED_MAP = {
  slow: 50,
  normal: 25,
  fast: 10,
  instant: 0,
};

// ════════════════════════════════════════════════════════════════
// StreamingAnswer Component (Typewriter Effect)
// ════════════════════════════════════════════════════════════════

export function StreamingAnswer({
  text,
  isStreaming = false,
  speed = 'normal',
  showCursor = true,
  cursorChar = '▋',
  className = '',
  onComplete,
  renderToken,
}: StreamingAnswerProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const previousTextRef = useRef('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const charDelay = SPEED_MAP[speed];

  useEffect(() => {
    if (speed === 'instant' || charDelay === 0) {
      setDisplayedText(text);
      if (text.length > previousTextRef.current.length) {
        previousTextRef.current = text;
        if (!isStreaming) {
          onComplete?.();
        }
      }
      return;
    }

    const newChars = text.slice(displayedText.length);
    
    if (newChars.length > 0) {
      setIsTyping(true);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      let charIndex = 0;
      intervalRef.current = setInterval(() => {
        if (charIndex < newChars.length) {
          setDisplayedText(prev => prev + newChars[charIndex]);
          charIndex++;
        } else {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsTyping(false);
          previousTextRef.current = text;
          
          if (!isStreaming) {
            onComplete?.();
          }
        }
      }, charDelay);
    } else if (!isStreaming && displayedText === text && text.length > 0) {
      onComplete?.();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [text, isStreaming, charDelay, displayedText, onComplete, speed]);

  // Reset when text is cleared
  useEffect(() => {
    if (text === '' && displayedText !== '') {
      setDisplayedText('');
      previousTextRef.current = '';
    }
  }, [text, displayedText]);

  const tokens = useMemo(() => {
    if (!renderToken) return null;
    return displayedText.split(/(\s+)/).map((token, i) => 
      renderToken(token, i)
    );
  }, [displayedText, renderToken]);

  return (
    <span className={`streaming-answer ${className}`}>
      {tokens || displayedText}
      <AnimatePresence>
        {showCursor && (isStreaming || isTyping) && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="cursor"
            style={{
              display: 'inline-block',
              marginLeft: '1px',
              animation: 'blink 1s step-end infinite',
            }}
          >
            {cursorChar}
          </motion.span>
        )}
      </AnimatePresence>
      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </span>
  );
}

// ════════════════════════════════════════════════════════════════
// StructuredAnswer Component (Full Answer Display)
// ════════════════════════════════════════════════════════════════

export function StructuredAnswer({
  sections = [],
  explanation,
  code,
  codeLanguage,
  bullets = [],
  spoken,
  isStreaming = false,
  streamingText = '',
  className = '',
}: StructuredAnswerProps) {
  return (
    <div className={`structured-answer ${className}`}>
      {/* Streaming preview */}
      {isStreaming && streamingText && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="streaming-preview p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4 border-l-4 border-blue-500"
        >
          <StreamingAnswer
            text={streamingText}
            isStreaming={isStreaming}
            speed="fast"
            showCursor={true}
            className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
          />
        </motion.div>
      )}

      {/* Sections */}
      {!isStreaming && sections.length > 0 && (
        <div className="sections space-y-4">
          {sections.map((section, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="section"
            >
              {section.title && (
                <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-2">
                  {section.title}
                </h4>
              )}
              {section.content && (
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  {section.content}
                </p>
              )}
              {section.points && section.points.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  {section.points.map((point, pointIndex) => (
                    <li key={pointIndex}>{point}</li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Explanation (fallback if no sections) */}
      {!isStreaming && !sections.length && explanation && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="explanation mb-4"
        >
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {explanation}
          </p>
        </motion.div>
      )}

      {/* Bullet points */}
      {!isStreaming && bullets.length > 0 && (
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bullets list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400 mb-4"
        >
          {bullets.map((bullet, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + index * 0.05 }}
            >
              {bullet}
            </motion.li>
          ))}
        </motion.ul>
      )}

      {/* Code block */}
      {!isStreaming && code && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="code-block mt-4"
        >
          <div className="flex items-center justify-between bg-gray-800 px-4 py-2 rounded-t-lg">
            <span className="text-xs text-gray-400 font-mono">
              {codeLanguage || 'code'}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(code)}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="bg-gray-900 p-4 rounded-b-lg overflow-x-auto">
            <code className={`text-sm text-gray-100 language-${codeLanguage || 'plaintext'}`}>
              {code}
            </code>
          </pre>
        </motion.div>
      )}

      {/* Spoken summary (for voice mode) */}
      {!isStreaming && spoken && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="spoken mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-4 border-blue-500"
        >
          <p className="text-sm text-blue-800 dark:text-blue-200 italic">
            "{spoken}"
          </p>
        </motion.div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ConnectionStatus Component
// ════════════════════════════════════════════════════════════════

export type ConnectionStatusType = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ConnectionStatusProps {
  status: ConnectionStatusType;
  className?: string;
  showLabel?: boolean;
}

export function ConnectionStatus({ status, className = '', showLabel = true }: ConnectionStatusProps) {
  const statusConfig = {
    disconnected: {
      color: 'bg-gray-400',
      label: 'Disconnected',
      pulse: false,
    },
    connecting: {
      color: 'bg-yellow-400',
      label: 'Connecting...',
      pulse: true,
    },
    connected: {
      color: 'bg-green-500',
      label: 'Connected',
      pulse: false,
    },
    reconnecting: {
      color: 'bg-orange-400',
      label: 'Reconnecting...',
      pulse: true,
    },
    error: {
      color: 'bg-red-500',
      label: 'Connection Error',
      pulse: false,
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="relative flex h-3 w-3">
        {config.pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-3 w-3 ${config.color}`}
        />
      </span>
      {showLabel && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {config.label}
        </span>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════════

export default StreamingAnswer;
