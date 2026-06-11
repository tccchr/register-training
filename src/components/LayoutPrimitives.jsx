import { Link } from 'react-router-dom';

export function PageIntro({ eyebrow, title, description, className = '', maxWidth = 'max-w-2xl' }) {
  return (
    <div className={className}>
      {eyebrow && <p className="text-sm font-semibold text-blue-700 mb-2">{eyebrow}</p>}
      <h2 className="font-display text-2xl sm:text-3xl font-semibold text-gray-950 leading-tight tracking-normal">{title}</h2>
      {description && (
        <p className={`mt-3 ${maxWidth} text-sm sm:text-base text-gray-500 leading-7`}>
          {description}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ message, action, className = 'py-12' }) {
  return (
    <div className={`text-center rounded-2xl border border-gray-200 bg-white px-6 ${className}`}>
      <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
        <span className="h-2.5 w-2.5 rounded-full bg-current" />
      </div>
      <p className={`text-gray-500 leading-7 ${action ? 'mb-5' : ''}`}>{message}</p>
      {action}
    </div>
  );
}

const toneStyles = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-green-50 text-green-700 border-green-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  gray: 'bg-gray-50 text-gray-700 border-gray-100'
};

export function ActionSummary({ eyebrow = 'งานที่ต้องทำ', title, description, items = [], action, className = '' }) {
  return (
    <section className={`app-panel p-4 sm:p-5 ${className}`} aria-label={eyebrow}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-700">{eyebrow}</p>
          <h3 className="mt-1 text-lg sm:text-xl font-bold text-gray-950">{title}</h3>
          {description && <p className="mt-1 text-sm text-gray-500 max-w-3xl">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {items.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className={`rounded-xl border px-4 py-3 ${toneStyles[item.tone] || toneStyles.gray}`}>
              <p className="text-2xl font-bold tabular-nums">{item.value}</p>
              <p className="mt-1 text-sm font-semibold">{item.label}</p>
              {item.hint && <p className="mt-1 text-xs opacity-80">{item.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function NavTab({ to, current, label, badge }) {
  const isActive = current === to;

  return (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className={`nav-tab inline-flex items-center justify-center min-h-[40px] px-3.5 sm:px-4 py-2 mb-2 text-sm font-semibold rounded-full border transition-colors whitespace-nowrap relative ${
        isActive ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/70 hover:border-gray-200 hover:text-gray-800'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
