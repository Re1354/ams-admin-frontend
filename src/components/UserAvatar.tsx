import { User as UserIcon } from 'lucide-react';

import { resolveMediaUrl } from '../lib/media';
import { cn } from '../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

type AvatarUser = {
  username?: string | null;
  full_name?: string | null;
  image?: string | null;
};

interface UserAvatarProps {
  user?: AvatarUser | null;
  className?: string;
  fallbackClassName?: string;
  showInitial?: boolean;
}

export function UserAvatar({
  user,
  className,
  fallbackClassName,
  showInitial = false,
}: UserAvatarProps) {
  const displayName = user?.full_name || user?.username || 'User';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <Avatar className={className}>
      <AvatarImage
        src={resolveMediaUrl(user?.image)}
        alt={`${displayName} profile`}
        className="object-cover"
      />
      <AvatarFallback className={cn('bg-blue-100 text-blue-700', fallbackClassName)}>
        {showInitial ? initial : <UserIcon className="h-1/2 w-1/2" strokeWidth={1.75} />}
      </AvatarFallback>
    </Avatar>
  );
}
