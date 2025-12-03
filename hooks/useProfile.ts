// hooks/useProfile.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
export interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  language: 'fr' | 'en';
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileData {
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string | null;
  language?: 'fr' | 'en';
}

export interface UpdatePasswordData {
  current_password: string;
  new_password: string;
}

// Fetch user profile
async function fetchProfile(): Promise<UserProfile> {
  const res = await fetch('/api/settings/profile');
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch profile');
  }
  return res.json();
}

// Update user profile
async function updateProfile(data: UpdateProfileData): Promise<UserProfile> {
  const res = await fetch('/api/settings/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update profile');
  }
  return res.json();
}

// Update password
async function updatePassword(data: UpdatePasswordData): Promise<void> {
  const res = await fetch('/api/settings/profile/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update password');
  }
}

// Hooks
export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: updatePassword,
  });
}