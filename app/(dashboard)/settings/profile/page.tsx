// app/(dashboard)/settings/profile/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  UserCircleIcon,
  ArrowLeftIcon,
  XMarkIcon,
  PencilIcon,
  CheckIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { useProfile, useUpdateProfile, useUpdatePassword } from '@/hooks/useProfile';
import { UploadButton } from '@/lib/uploadthing';
import toast from 'react-hot-toast';

export default function ProfileSettingsPage() {
  const { language } = useLanguage();
  const { data: profile, isLoading, refetch } = useProfile();
  const { mutateAsync: updateProfile, isPending: savingProfile } = useUpdateProfile();
  const { mutateAsync: updatePassword, isPending: savingPassword } = useUpdatePassword();

  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    avatar_url: '',
    language: 'fr' as 'fr' | 'en',
  });

  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  useEffect(() => {
    if (profile) {
      setProfileData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
        avatar_url: profile.avatar_url || '',
        language: profile.language || 'fr',
      });
    }
  }, [profile]);

  const labels = {
    pageTitle: { en: 'Profile', fr: 'Profil' },
    pageSubtitle: { en: 'Manage your personal information', fr: 'Gérez vos informations personnelles' },
    back: { en: 'Back to Settings', fr: 'Retour aux Paramètres' },
    edit: { en: 'Edit', fr: 'Modifier' },
    save: { en: 'Save Changes', fr: 'Enregistrer' },
    cancel: { en: 'Cancel', fr: 'Annuler' },
    personalInfo: { en: 'Personal Information', fr: 'Informations Personnelles' },
    firstName: { en: 'First Name', fr: 'Prénom' },
    lastName: { en: 'Last Name', fr: 'Nom' },
    email: { en: 'Email', fr: 'Email' },
    emailHelp: { en: 'Used for login and notifications', fr: 'Utilisé pour la connexion et les notifications' },
    avatar: { en: 'Profile Photo', fr: 'Photo de Profil' },
    avatarHelp: { en: 'JPG or PNG, max 2MB', fr: 'JPG ou PNG, max 2Mo' },
    uploadPhoto: { en: 'Upload Photo', fr: 'Télécharger une photo' },
    changePhoto: { en: 'Change Photo', fr: 'Changer la photo' },
    removePhoto: { en: 'Remove', fr: 'Supprimer' },
    preferences: { en: 'Preferences', fr: 'Préférences' },
    languagePref: { en: 'Language', fr: 'Langue' },
    languageHelp: { en: 'Your preferred language', fr: 'Votre langue préférée' },
    french: { en: 'French', fr: 'Français' },
    english: { en: 'English', fr: 'Anglais' },
    security: { en: 'Security', fr: 'Sécurité' },
    changePassword: { en: 'Change Password', fr: 'Changer le mot de passe' },
    currentPassword: { en: 'Current Password', fr: 'Mot de passe actuel' },
    newPassword: { en: 'New Password', fr: 'Nouveau mot de passe' },
    confirmPassword: { en: 'Confirm New Password', fr: 'Confirmer le mot de passe' },
    passwordHelp: { en: 'At least 8 characters', fr: 'Au moins 8 caractères' },
    updatePassword: { en: 'Update Password', fr: 'Mettre à jour' },
    updatingPassword: { en: 'Updating...', fr: 'Mise à jour...' },
    saving: { en: 'Saving...', fr: 'Enregistrement...' },
    saveSuccess: { en: 'Profile updated successfully', fr: 'Profil mis à jour avec succès' },
    saveError: { en: 'Error updating profile', fr: 'Erreur lors de la mise à jour' },
    passwordSuccess: { en: 'Password updated successfully', fr: 'Mot de passe mis à jour' },
    passwordError: { en: 'Error updating password', fr: 'Erreur lors de la mise à jour du mot de passe' },
    passwordMismatch: { en: 'Passwords do not match', fr: 'Les mots de passe ne correspondent pas' },
    avatarUploadSuccess: { en: 'Photo uploaded', fr: 'Photo téléchargée' },
    avatarUploadError: { en: 'Error uploading photo', fr: 'Erreur lors du téléchargement' },
    avatarRemoveSuccess: { en: 'Photo removed', fr: 'Photo supprimée' },
    notSet: { en: 'Not set', fr: 'Non défini' },
  };

  const handleProfileChange = (field: string, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData(prev => ({ ...prev, [field]: value }));
  };

  const handleRemoveAvatar = async () => {
    try {
      await updateProfile({ avatar_url: null });
      setProfileData(prev => ({ ...prev, avatar_url: '' }));
      toast.success(labels.avatarRemoveSuccess[language]);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(profileData);
      toast.success(labels.saveSuccess[language]);
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error(labels.passwordMismatch[language]);
      return;
    }

    try {
      await updatePassword({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      toast.success(labels.passwordSuccess[language]);
      setIsChangingPassword(false);
    } catch (error: any) {
      toast.error(error.message || labels.passwordError[language]);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      setProfileData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
        avatar_url: profile.avatar_url || '',
        language: profile.language || 'fr',
      });
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          href="/settings"
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          {labels.back[language]}
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <UserCircleIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {labels.pageTitle[language]}
              </h1>
              <p className="text-sm text-gray-600">
                {labels.pageSubtitle[language]}
              </p>
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <PencilIcon className="w-4 h-4" />
              <span>{labels.edit[language]}</span>
            </button>
          )}
        </div>

        {/* VIEW MODE */}
        {!isEditing && (
          <div className="space-y-6">
            {/* Personal Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.personalInfo[language]}
              </h3>

              <div className="space-y-4">
                {/* Avatar */}
                <div className="flex items-center space-x-4 pb-4 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">
                    {labels.avatar[language]}
                  </div>
                  <div>
                    {profileData.avatar_url ? (
                      <Image
                        src={profileData.avatar_url}
                        alt="Profile"
                        width={64}
                        height={64}
                        className="w-16 h-16 rounded-full object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                        <UserCircleIcon className="w-10 h-10 text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>

                {/* First Name */}
                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">
                    {labels.firstName[language]}
                  </div>
                  <div className="text-sm text-gray-900">
                    {profileData.first_name || <span className="text-gray-400">{labels.notSet[language]}</span>}
                  </div>
                </div>

                {/* Last Name */}
                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">
                    {labels.lastName[language]}
                  </div>
                  <div className="text-sm text-gray-900">
                    {profileData.last_name || <span className="text-gray-400">{labels.notSet[language]}</span>}
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-center py-3">
                  <div className="text-sm font-medium text-gray-700 w-32">
                    {labels.email[language]}
                  </div>
                  <div className="text-sm text-gray-900">{profileData.email}</div>
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.preferences[language]}
              </h3>

              <div className="flex items-center py-3">
                <div className="text-sm font-medium text-gray-700 w-32">
                  {labels.languagePref[language]}
                </div>
                <div className="text-sm text-gray-900">
                  {profileData.language === 'fr' ? labels.french[language] : labels.english[language]}
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-900">
                  {labels.security[language]}
                </h3>
                <button
                  onClick={() => setIsChangingPassword(true)}
                  className="flex items-center space-x-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  <KeyIcon className="w-4 h-4" />
                  <span>{labels.changePassword[language]}</span>
                </button>
              </div>
              <p className="text-sm text-gray-600">
                {labels.emailHelp[language]}
              </p>
            </div>
          </div>
        )}

        {/* EDIT MODE */}
        {isEditing && (
          <form onSubmit={handleProfileSubmit} className="space-y-6">
            {/* Personal Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.personalInfo[language]}
              </h3>

              <div className="space-y-4">
                {/* Avatar */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.avatar[language]}
                  </label>
                  <p className="text-xs text-gray-500 mb-3">{labels.avatarHelp[language]}</p>
                  
                  <div className="flex items-center space-x-4">
                    {profileData.avatar_url ? (
                      <div className="relative">
                        <Image
                          src={profileData.avatar_url}
                          alt="Profile"
                          width={80}
                          height={80}
                          className="w-20 h-20 rounded-full object-cover border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="absolute -top-2 -right-2 p-1 bg-red-100 rounded-full text-red-600 hover:bg-red-200"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                        <UserCircleIcon className="w-12 h-12 text-gray-400" />
                      </div>
                    )}

                    <UploadButton
                      endpoint="userAvatar"
                      onClientUploadComplete={(res) => {
                        if (res?.[0]?.url) {
                          setProfileData(prev => ({ ...prev, avatar_url: res[0].url }));
                          refetch();
                          toast.success(labels.avatarUploadSuccess[language]);
                        }
                      }}
                      onUploadError={(error: Error) => {
                        toast.error(labels.avatarUploadError[language]);
                        console.error('Upload error:', error);
                      }}
                      appearance={{
                        button: "bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium px-4 py-2 rounded-lg",
                        allowedContent: "hidden",
                      }}
                    />
                  </div>
                </div>

                {/* First Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.firstName[language]}
                  </label>
                  <input
                    type="text"
                    value={profileData.first_name}
                    onChange={(e) => handleProfileChange('first_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.lastName[language]}
                  </label>
                  <input
                    type="text"
                    value={profileData.last_name}
                    onChange={(e) => handleProfileChange('last_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.email[language]}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">{labels.emailHelp[language]}</p>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => handleProfileChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.preferences[language]}
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {labels.languagePref[language]}
                </label>
                <p className="text-xs text-gray-500 mb-2">{labels.languageHelp[language]}</p>
                <select
                  value={profileData.language}
                  onChange={(e) => handleProfileChange('language', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="fr">{labels.french[language]}</option>
                  <option value="en">{labels.english[language]}</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {labels.cancel[language]}
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                <span>{savingProfile ? labels.saving[language] : labels.save[language]}</span>
              </button>
            </div>
          </form>
        )}

        {/* Password Change Modal/Section */}
        {isChangingPassword && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {labels.changePassword[language]}
                </h3>
                <button
                  onClick={() => {
                    setIsChangingPassword(false);
                    setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {/* Current Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.currentPassword[language]}
                  </label>
                  <input
                    type="password"
                    value={passwordData.current_password}
                    onChange={(e) => handlePasswordChange('current_password', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.newPassword[language]}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">{labels.passwordHelp[language]}</p>
                  <input
                    type="password"
                    value={passwordData.new_password}
                    onChange={(e) => handlePasswordChange('new_password', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    minLength={8}
                  />
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.confirmPassword[language]}
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirm_password}
                    onChange={(e) => handlePasswordChange('confirm_password', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    minLength={8}
                  />
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPassword(false);
                      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {labels.cancel[language]}
                  </button>
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingPassword ? labels.updatingPassword[language] : labels.updatePassword[language]}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}