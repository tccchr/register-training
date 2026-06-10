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
