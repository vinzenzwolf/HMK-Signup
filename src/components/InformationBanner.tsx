import './InformationBanner.css'

type InformationBannerProps = {
  message: string;
  variant?: 'error' | 'info' | 'success';
};

function InformationBanner({
  message,
  variant = 'error',
}: InformationBannerProps) {
  return (
    <div className={`banner banner-${variant}`}>
      {message}
    </div>
  );
}

export default InformationBanner;