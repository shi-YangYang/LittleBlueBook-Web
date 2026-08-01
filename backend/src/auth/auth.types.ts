import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type PublicUser = {
  id: string;
  email: string;
  nickname: string;
  avatar: ProfileAvatar;
};

export type AuthenticatedResult = {
  status: 'authenticated';
  user: PublicUser;
  sessionId: string;
};

export type RegistrationRequiredResult = {
  status: 'registration_required';
  registrationId: string;
};

export type VerificationResult =
  AuthenticatedResult | RegistrationRequiredResult;

export type StoredSession = {
  userId: string;
  createdAt: string;
};

export type StoredRegistration = {
  email: string;
  createdAt: string;
};
