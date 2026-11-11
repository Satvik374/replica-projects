export function BrandMark({ size = 16 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <rect width="256" height="256" rx="56" fill="#1b1b1f" />
      <circle cx="128" cy="128" r="74" fill="none" stroke="#f5a623" strokeWidth="12" />
      <path d="M86 128a42 42 0 0 1 42-42" fill="none" stroke="#3ecfa6" strokeWidth="16" strokeLinecap="round" />
      <path d="M128 170a42 42 0 0 1-42-42" fill="none" stroke="#8a9bff" strokeWidth="16" strokeLinecap="round" />
    </svg>
  );
}
