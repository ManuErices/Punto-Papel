// MetricCard
export function MetricCard({ label, value, delta, deltaPositive, gradient, icon }) {
  return (
    <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: gradient }}>
      <p className="text-[10px] uppercase tracking-widest mb-2 text-white/50">{label}</p>
      <p className="text-[22px] font-semibold tracking-tight text-white">{value}</p>
      {delta && (
        <p className="text-[11px] mt-1 text-white/50">
          <b className={deltaPositive ? 'text-emerald-300' : 'text-red-300'}>{delta}</b>
          {' '}vs ayer
        </p>
      )}
      {icon && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-[10px]
          bg-white/10 flex items-center justify-center">
          {icon}
        </div>
      )}
    </div>
  )
}

// Badge
export function Badge({ children, variant = 'default' }) {
  const styles = {
    default: 'bg-black/5 dark:bg-white/[0.06] text-gray-500 dark:text-white/30 border border-black/[0.08] dark:border-white/[0.08]',
    low:     'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    ok:      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    danger:  'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${styles[variant]}`}>
      {(variant === 'low' || variant === 'ok' || variant === 'danger') && (
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  )
}

// Button
export function Button({ children, onClick, variant = 'primary', className = '', disabled = false }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[12px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary:   'text-white border-none',
    secondary: 'bg-black/5 dark:bg-white/[0.06] text-gray-700 dark:text-white/70 border border-black/[0.08] dark:border-white/[0.1] hover:bg-black/10 dark:hover:bg-white/[0.1]',
    danger:    'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/15',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
      style={variant === 'primary' ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}
    >
      {children}
    </button>
  )
}

// Card
export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-white/[0.04] border border-black/[0.07] dark:border-white/[0.07] rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  )
}

// CardHeader
export function CardHeader({ title, badge }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80">{title}</h3>
      {badge && <Badge>{badge}</Badge>}
    </div>
  )
}

// Input
export function Input({ label, error, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[11px] text-gray-500 dark:text-white/40 uppercase tracking-wide">{label}</label>}
      <input
        {...props}
        className={`h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
          text-gray-900 dark:text-white
          placeholder:text-gray-400 dark:placeholder:text-white/25
          focus:outline-none focus:ring-2 transition-all
          ${error
            ? 'border border-red-400 dark:border-red-500/70 focus:ring-red-400/30'
            : 'border border-black/[0.08] dark:border-white/[0.08] focus:ring-brand-500/30'
          }`}
      />
      {error && <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5">{error}</p>}
    </div>
  )
}
