import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { X } from 'lucide-react';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = botón principal rojo (eliminar / acciones irreversibles) */
  variant?: 'danger' | 'default';
  /** Checkbox opcional mostrado antes de confirmar. */
  checkbox?: {
    label: string;
    defaultChecked?: boolean;
  };
};

export type ConfirmResult = {
  confirmed: boolean;
  checkboxValue?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<
    null | { options: ConfirmOptions; resolve: (v: ConfirmResult) => void; checkboxValue: boolean }
  >(null);

  const confirm: ConfirmFn = useCallback((options) => {
    return new Promise<ConfirmResult>((resolve) => {
      setState({
        options,
        resolve,
        checkboxValue: options.checkbox?.defaultChecked ?? false,
      });
    });
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    setState((s) => {
      if (s) {
        s.resolve({
          confirmed,
          checkboxValue: s.options.checkbox ? s.checkboxValue : undefined,
        });
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, finish]);

  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);

  const opts = state?.options;
  const variant = opts?.variant ?? 'default';
  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-500'
      : 'bg-zinc-900 hover:bg-zinc-800 text-white focus-visible:ring-zinc-400';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && opts && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={() => finish(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-100 flex justify-between items-start gap-4">
              <h2 id="confirm-dialog-title" className="text-lg font-bold text-zinc-900 pr-2">
                {opts.title}
              </h2>
              <button
                type="button"
                className="p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100 shrink-0 -mr-1 -mt-1"
                onClick={() => finish(false)}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 pb-2 space-y-3">
              <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
                {opts.message}
              </p>
              {opts.checkbox && state && (
                <label className="flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.checkboxValue}
                    onChange={(e) =>
                      setState((prev) =>
                        prev ? { ...prev, checkboxValue: e.target.checked } : prev
                      )
                    }
                    className="mt-0.5 shrink-0"
                  />
                  <span>{opts.checkbox.label}</span>
                </label>
              )}
            </div>
            <div className="p-6 pt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-800 font-medium hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                onClick={() => finish(false)}
              >
                {opts.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${confirmBtnClass}`}
                onClick={() => finish(true)}
              >
                {opts.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  }
  return ctx;
}
