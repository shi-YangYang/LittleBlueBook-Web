/* eslint-disable @next/next/no-img-element */

export type ProfileAvatar =
  | {
      type: 'initial';
      value: string;
    }
  | {
      type: 'image';
      value: string;
    };

type AvatarProps = {
  avatar: ProfileAvatar;
  className: string;
  label?: string;
};

export function Avatar({ avatar, className, label }: AvatarProps) {
  if (avatar.type === 'image') {
    return (
      <img
        className={className}
        src={avatar.value}
        alt={label ?? ''}
        aria-hidden={label ? undefined : true}
      />
    );
  }

  return (
    <span
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {avatar.value}
    </span>
  );
}
