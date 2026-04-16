'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface ToastContextType {
  showToast: (type: 'success' | 'error', message: string) => void
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = nextId++
    setToasts(prev => [...prev, { id, type, message }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container — fixed top-center for high visibility */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-3 pointer-events-none">
        {toasts.map(toast => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))

    const timer = setTimeout(() => {
      setExiting(true)
      setTimeout(onDismiss, 400)
    }, 5000)

    return () => clearTimeout(timer)
  }, [onDismiss])

  const isSuccess = toast.type === 'success'

  return (
    <div
      className={`pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-400 min-w-[360px] max-w-[500px] ${
        isSuccess
          ? 'bg-green-950/95 border-green-500/50 text-green-50'
          : 'bg-red-950/95 border-red-500/50 text-red-50'
      } ${
        visible && !exiting
          ? 'translate-y-0 opacity-100 scale-100'
          : '-translate-y-4 opacity-0 scale-95'
      }`}
      style={{ boxShadow: isSuccess
        ? '0 8px 32px rgba(34, 197, 94, 0.25), 0 0 0 1px rgba(34, 197, 94, 0.1)'
        : '0 8px 32px rgba(239, 68, 68, 0.25), 0 0 0 1px rgba(239, 68, 68, 0.1)'
      }}
    >
      <div className={`flex-shrink-0 p-1.5 rounded-full ${isSuccess ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
        {isSuccess ? (
          <CheckCircle className="w-6 h-6 text-green-400" />
        ) : (
          <XCircle className="w-6 h-6 text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
          {isSuccess ? 'Order Confirmed' : 'Order Failed'}
        </p>
        <p className="text-sm font-medium">{toast.message}</p>
      </div>
      <button
        onClick={() => {
          setExiting(true)
          setTimeout(onDismiss, 400)
        }}
        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition"
      >
        <X className="w-4 h-4 opacity-60" />
      </button>
    </div>
  )
}
