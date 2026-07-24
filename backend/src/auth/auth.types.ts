export type PublicUser = {
  id: string;
  email: string;
  nickname: string;
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
