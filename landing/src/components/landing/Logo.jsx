export const LogoMark = ({ className = "h-8 w-8" }) => (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
        <defs>
            <linearGradient id="ysmm-logo-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#4F46E5" />
                <stop offset="1" stopColor="#2563EB" />
            </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#ysmm-logo-g)" />
        <path
            d="M18 22.5C18 19.46 20.46 17 23.5 17h17C43.54 17 46 19.46 46 22.5v11c0 3.04-2.46 5.5-5.5 5.5H27l-6.2 5.43A1.4 1.4 0 0 1 18 43.36V22.5z"
            fill="#ffffff"
        />
        <circle cx="25.5" cy="28" r="2.4" fill="#4F46E5" />
        <circle cx="32.5" cy="28" r="2.4" fill="#2563EB" />
        <circle cx="39.5" cy="28" r="2.4" fill="#4F46E5" opacity="0.55" />
    </svg>
);

export const Logo = ({ className = "" }) => (
    <a
        href="#top"
        data-testid="logo-home-link"
        className={`inline-flex items-center gap-2.5 ${className}`}
        aria-label="YourSMMagent home"
    >
        <LogoMark />
        <span className="text-lg font-bold tracking-tight text-slate-900">
            Your<span className="text-indigo-600">SMM</span>agent
        </span>
    </a>
);

export default Logo;
