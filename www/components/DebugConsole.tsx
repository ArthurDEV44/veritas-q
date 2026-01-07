"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Copy, Trash2, ChevronDown, ChevronUp, Bug } from "lucide-react";

interface LogEntry {
  id: number;
  timestamp: Date;
  level: "log" | "warn" | "error" | "info";
  args: string[];
}

/**
 * DebugConsole - Affiche les logs directement dans l'interface
 *
 * Utile pour le debugging sur iOS Safari où la console n'est pas accessible
 * sans un Mac connecté en USB.
 *
 * Inspiré par les pratiques recommandées:
 * - https://www.xjavascript.com/blog/how-can-i-get-console-log-output-from-my-mobile-on-the-mobile-device/
 * - https://medium.com/@carolyn.webster/debugging-react-app-in-safari-on-ios-6e07072f59df
 */
export default function DebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  // Capture console methods
  useEffect(() => {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };

    const createLogInterceptor = (level: LogEntry["level"]) => {
      return (...args: unknown[]) => {
        // Call original console method
        originalConsole[level](...args);

        // Add to our log list
        const entry: LogEntry = {
          id: logIdRef.current++,
          timestamp: new Date(),
          level,
          args: args.map((arg) => {
            if (arg === null) return "null";
            if (arg === undefined) return "undefined";
            if (typeof arg === "object") {
              try {
                return JSON.stringify(arg, null, 2);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          }),
        };

        setLogs((prev) => [...prev.slice(-200), entry]); // Keep last 200 logs
      };
    };

    // Override console methods
    console.log = createLogInterceptor("log");
    console.warn = createLogInterceptor("warn");
    console.error = createLogInterceptor("error");
    console.info = createLogInterceptor("info");

    // Add initial log
    console.log("[DebugConsole] Console interceptor initialized");

    // Log some useful device info
    if (typeof navigator !== "undefined") {
      console.info("[DebugConsole] UserAgent:", navigator.userAgent);
      console.info("[DebugConsole] Platform:", navigator.platform);
      if ("mediaDevices" in navigator) {
        console.info("[DebugConsole] MediaDevices API available");
      } else {
        console.warn("[DebugConsole] MediaDevices API NOT available");
      }
    }

    // Capture unhandled errors
    const errorHandler = (event: ErrorEvent) => {
      console.error("[Unhandled Error]", event.message, "at", event.filename, ":", event.lineno);
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      console.error("[Unhandled Promise Rejection]", event.reason);
    };

    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", rejectionHandler);

    return () => {
      // Restore original console methods
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.info = originalConsole.info;
      window.removeEventListener("error", errorHandler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current && isOpen && !isMinimized) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen, isMinimized]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    console.log("[DebugConsole] Logs cleared");
  }, []);

  const copyLogs = useCallback(async () => {
    const logText = logs
      .map((log) => {
        const time = log.timestamp.toISOString();
        const level = log.level.toUpperCase().padEnd(5);
        return `[${time}] ${level} ${log.args.join(" ")}`;
      })
      .join("\n");

    try {
      await navigator.clipboard.writeText(logText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      // Fallback for iOS Safari
      const textArea = document.createElement("textarea");
      textArea.value = logText;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch {
        console.error("[DebugConsole] Failed to copy logs");
      }
      document.body.removeChild(textArea);
    }
  }, [logs]);

  const getLevelColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "error":
        return "text-red-400 bg-red-500/10";
      case "warn":
        return "text-yellow-400 bg-yellow-500/10";
      case "info":
        return "text-blue-400 bg-blue-500/10";
      default:
        return "text-gray-300 bg-gray-500/10";
    }
  };

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-24 right-4 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
          isOpen
            ? "bg-quantum text-black"
            : "bg-surface-elevated text-foreground border border-border"
        }`}
        aria-label="Toggle debug console"
      >
        <Bug className="w-5 h-5" />
        {/* Badge for errors/warnings */}
        {!isOpen && (errorCount > 0 || warnCount > 0) && (
          <span
            className={`absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center ${
              errorCount > 0 ? "bg-red-500 text-white" : "bg-yellow-500 text-black"
            }`}
          >
            {errorCount > 0 ? errorCount : warnCount}
          </span>
        )}
      </button>

      {/* Console panel */}
      {isOpen && (
        <div
          className={`fixed left-2 right-2 z-50 bg-gray-900 rounded-lg shadow-2xl border border-gray-700 overflow-hidden transition-all ${
            isMinimized ? "bottom-24 h-12" : "bottom-24 h-[50vh] max-h-[400px]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-quantum" />
              <span className="text-sm font-medium text-white">Debug Console</span>
              <span className="text-xs text-gray-400">({logs.length})</span>
              {errorCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
                  {errorCount} errors
                </span>
              )}
              {warnCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
                  {warnCount} warns
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={copyLogs}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                aria-label="Copy logs"
              >
                {copyFeedback ? (
                  <span className="text-xs text-green-400">Copied!</span>
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={clearLogs}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                aria-label="Clear logs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                aria-label={isMinimized ? "Expand" : "Minimize"}
              >
                {isMinimized ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                aria-label="Close console"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Logs container */}
          {!isMinimized && (
            <div
              ref={logContainerRef}
              className="h-[calc(100%-44px)] overflow-y-auto font-mono text-xs"
            >
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No logs yet. Interact with the app to see logs here.
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`px-2 py-1 border-b border-gray-800 ${getLevelColor(log.level)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 shrink-0">
                        {log.timestamp.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          fractionalSecondDigits: 3,
                        })}
                      </span>
                      <span
                        className={`shrink-0 px-1 rounded text-[10px] font-bold uppercase ${
                          log.level === "error"
                            ? "bg-red-500 text-white"
                            : log.level === "warn"
                            ? "bg-yellow-500 text-black"
                            : log.level === "info"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-600 text-white"
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="break-all whitespace-pre-wrap">
                        {log.args.join(" ")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
