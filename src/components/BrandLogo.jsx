export default function BrandLogo({ className = 'h-8 w-auto', tone = 'dark' }) {
  const logoFile = tone === 'light' ? 'learning-lab-white-crop.png' : 'learning-lab-black-crop.png';
  const logoSrc = `${import.meta.env.BASE_URL}brand/${logoFile}`;

  return (
    <img
      className={`object-contain ${className}`}
      src={logoSrc}
      alt="TCCC Learning LAB"
      loading="eager"
      decoding="async"
    />
  );
}
