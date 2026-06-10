export default function ConfirmModal({ isOpen, title, message, type = 'danger', onConfirm, onCancel, confirmText = 'ยืนยัน', cancelText = 'ยกเลิก' }) {
  if (!isOpen) return null;

  const getColors = () => {
    switch(type) {
      case 'danger':
        return {
          iconBg: 'bg-red-100',
          iconText: 'text-red-600',
          buttonBg: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )
        };
      case 'warning':
        return {
          iconBg: 'bg-orange-100',
          iconText: 'text-orange-600',
          buttonBg: 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500',
          icon: (
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'info':
      default:
        return {
          iconBg: 'bg-blue-100',
          iconText: 'text-blue-600',
          buttonBg: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
    }
  };

  const colors = getColors();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className={`w-14 h-14 rounded-full ${colors.iconBg} ${colors.iconText} flex items-center justify-center mx-auto mb-4`}>
            {colors.icon}
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-500 mb-8 whitespace-pre-line text-left">{message}</p>
          
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors"
            >
              {cancelText}
            </button>
            <button 
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 text-white font-medium rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${colors.buttonBg}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
