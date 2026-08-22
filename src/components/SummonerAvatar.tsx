interface SummonerAvatarProps {
  gameName?: string;
  profileIconDataUrl?: string;
  size?: 'default' | 'large';
}

export function SummonerAvatar({
  gameName,
  profileIconDataUrl,
  size = 'default',
}: SummonerAvatarProps) {
  const className = size === 'large' ? 'avatar avatar--large' : 'avatar';
  return (
    <div className={className} aria-hidden="true">
      {profileIconDataUrl
        ? <img className="avatar__image" src={profileIconDataUrl} alt="" draggable={false} />
        : gameName?.slice(0, 1).toUpperCase()}
    </div>
  );
}
