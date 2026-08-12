import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type PublicUser = {
  id: string;
  email: string;
  nickname: string;
  avatar: ProfileAvatar;
  role?: 'ADMIN';
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
  authVersion: number;
  createdAt: string;
};

export type LegalChallenge = {
  challengeId: string;
  termsVersion: string;
  privacyVersion: string;
};

export type StoredRegistration = LegalChallenge & {
  email: string;
  createdAt: string;
};

export type LegalStatus = {
  authenticated: boolean;
  requiresAcceptance: boolean;
  accountRestricted: boolean;
  termsVersion: string;
  privacyVersion: string;
  termsUrl: '/terms';
  privacyUrl: '/privacy';
};
