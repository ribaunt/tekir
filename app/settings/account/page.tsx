"use client";
import Link from "next/link";
import { getUserAvatarUrl } from "@/lib/avatar";
import ImageUpload from "@/components/image-upload";
import SubscriptionManager from "@/components/subscription-manager";
import { useSettings } from "@/lib/settings";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth-provider";
import { toast } from "sonner";
import posthog from "posthog-js";
import {
  Search,
  User,
  Shield,
  MessageCircleMore,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Trash2,
  Save,
  RefreshCw,
  Cloud,
  Info,
  BarChart3,
  LogIn
} from "lucide-react";
import { SettingsShell, type SettingsNavItem, type MobileNavItem } from "@/components/settings/settings-shell";

export default function AccountSettingsPage() {
  const { user, status, signOut, refreshUser } = useAuth();
  const { syncEnabled, toggleSync, isInitialized } = useSettings();
  const router = useRouter();
  const tSettings = useTranslations("settings");
  const tAccount = useTranslations("settings.accountPage");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const tSubscription = useTranslations("subscription");
  const [isLoading, setIsLoading] = useState(false);
  
  // Form states
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // UI states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isRegeneratingAvatar, setIsRegeneratingAvatar] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [avatarRefreshKey, setAvatarRefreshKey] = useState(Date.now());
  const fieldLabels = {
    email: tAccount("emailSection.label"),
    name: tAccount("nameSection.label"),
    username: tAccount("usernameSection.label"),
  } as const;
  const deleteConfirmPhrase = tAccount("dangerZone.confirmPhrase");
  const mobileNavItems: MobileNavItem[] = [
    {
      href: "/search",
      icon: Search,
      label: tAccount("mobileNav.back"),
    },
    {
      href: "https://chat.tekir.co",
      icon: MessageCircleMore,
      label: tAccount("mobileNav.chat"),
    },
    {
      href: "/about",
      icon: Lock,
      label: tAccount("mobileNav.privacy"),
    },
  ];

  // Load user data when user is available
  useEffect(() => {
    if (user) {
      setEmail(user.email || "");
      setName(user.name || "");
      setUsername(user.username || "");
      // Force avatar refresh when user changes
      setAvatarRefreshKey(Date.now());
    }
  }, [user]);

  useEffect(() => {
    document.title = `${tAccount("metaTitle")} | Tekir`;
  }, [tAccount]);

  // Click outside handler for mobile settings dropdown
  const handleEmailUpdate = async () => {
    if (!email.trim()) {
      toast.error(tAccount("messages.requiredField", { field: fieldLabels.email }));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/user/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
        credentials: 'include'
      });

      if (response.ok) {
        await response.json();
        await refreshUser();
        toast.success(tAccount("messages.updateSuccess", { field: fieldLabels.email }));
      } else {
        const data = await response.json();
        toast.error(data.error ?? tAccount("messages.updateError", { field: fieldLabels.email }));
      }
    } catch (error) {
      toast.error(tAccount("messages.updateException", { field: fieldLabels.email }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleNameUpdate = async () => {
    if (!name.trim()) {
      toast.error(tAccount("messages.requiredField", { field: fieldLabels.name }));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/user/name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
        credentials: 'include'
      });

      if (response.ok) {
        await response.json();
        await refreshUser();
        toast.success(tAccount("messages.updateSuccess", { field: fieldLabels.name }));
      } else {
        const data = await response.json();
        toast.error(data.error ?? tAccount("messages.updateError", { field: fieldLabels.name }));
      }
    } catch (error) {
      toast.error(tAccount("messages.updateException", { field: fieldLabels.name }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsernameUpdate = async () => {
    if (!username.trim()) {
      toast.error(tAccount("messages.requiredField", { field: fieldLabels.username }));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/user/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
        credentials: 'include'
      });

      if (response.ok) {
        await response.json();
        await refreshUser();
        toast.success(tAccount("messages.updateSuccess", { field: fieldLabels.username }));
      } else {
        const data = await response.json();
        toast.error(data.error ?? tAccount("messages.updateError", { field: fieldLabels.username }));
      }
    } catch (error) {
      toast.error(tAccount("messages.updateException", { field: fieldLabels.username }));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(tAccount("messages.passwordRequired"));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(tAccount("messages.passwordMismatch"));
      return;
    }

    if (newPassword.length < 8) {
      toast.error(tAccount("messages.passwordLength"));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword
        }),
        credentials: 'include'
      });

      if (response.ok) {
        // Capture password change event in PostHog
        posthog.capture('password_changed');

        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success(tAccount("messages.passwordSuccess"));
      } else {
        const data = await response.json();
        toast.error(data.error ?? tAccount("messages.passwordError"));
      }
    } catch (error) {
      toast.error(tAccount("messages.passwordException"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateAvatar = async () => {
    setIsRegeneratingAvatar(true);
    try {
      const response = await fetch('/api/user/avatar/regenerate', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        await response.json();

        // Refresh user data from backend to get the latest avatar
        await refreshUser();

        // Force avatar refresh with a new key
        const newKey = Date.now();
        setAvatarRefreshKey(newKey);

        toast.success(tAccount('messages.avatarRegenerateSuccess'));
      } else {
        const data = await response.json();
        toast.error(data.error ?? tAccount('messages.avatarRegenerateError'));
      }
    } catch (error) {
      toast.error(tAccount('messages.avatarRegenerateException'));
    } finally {
      setIsRegeneratingAvatar(false);
    }
  };

  const handleUploadAvatar = async (imageData: string) => {
    setIsUploadingAvatar(true);
    try {
      const response = await fetch('/api/user/avatar/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageData }),
        credentials: 'include'
      });

      if (response.ok) {
        await response.json();

        // Refresh user data from backend to get the latest avatar
        await refreshUser();

        setTimeout(() => {
          setAvatarRefreshKey(Date.now());
        }, 100);

        toast.success(tAccount('messages.avatarUploadSuccess'));
      } else {
        const data = await response.json();
        throw new Error(data.error ?? tAccount('messages.avatarUploadError'));
      }
    } catch (error) {
      const fallbackMessage = tAccount('messages.avatarUploadException');
      const errorMessage = error instanceof Error && error.message ? error.message : fallbackMessage;
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true);
    try {
      const response = await fetch('/api/user/avatar/upload', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        // Refresh user data from backend to get the latest avatar state
        await refreshUser();

        setTimeout(() => {
          setAvatarRefreshKey(Date.now());
        }, 100);

        toast.success(tAccount('messages.avatarRemoveSuccess'));
      } else {
        const data = await response.json();
        throw new Error(data.error ?? tAccount('messages.avatarRemoveError'));
      }
    } catch (error) {
      const fallbackMessage = tAccount('messages.avatarRemoveException');
      const errorMessage = error instanceof Error && error.message ? error.message : fallbackMessage;
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== deleteConfirmPhrase) {
      toast.error(tAccount('messages.deleteConfirmationMissing', { phrase: deleteConfirmPhrase }));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        // Capture account deletion event in PostHog before signing out
        posthog.capture('account_deleted');
        posthog.reset();

        await signOut();
        router.push('/');
      } else {
        const data = await response.json();
        toast.error(data.error ?? tAccount('messages.deleteError'));
      }
    } catch (error) {
      toast.error(tAccount('messages.deleteException'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingsSyncToggle = async () => {
    if (!isInitialized) {
      toast.error(tAccount('messages.syncLoading'));
      return;
    }

    setIsLoading(true);
    try {
      const success = await toggleSync(!syncEnabled);
      if (success) {
        // Capture settings sync toggle event in PostHog
        posthog.capture('settings_sync_toggled', {
          sync_enabled: !syncEnabled,
        });

        toast.success(
          syncEnabled
            ? tAccount('messages.syncDisabled')
            : tAccount('messages.syncEnabled')
        );
      } else {
        toast.error(tAccount('messages.syncError'));
      }
    } catch (error) {
      let errorMessage = tAccount('messages.syncException');

      if (error instanceof Error && error.message.includes('User record not found')) {
        errorMessage = tAccount('messages.sessionOutdated');
        setTimeout(() => {
          signOut();
        }, 3000);
      }

      toast.error(errorMessage);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const sidebarItemsEarly: SettingsNavItem[] = [
    { href: "/settings/search", icon: Search, label: tSettings("search") },
    { href: "/settings/account", icon: User, label: tSettings("account"), active: true },
    { href: "/settings/privacy", icon: Shield, label: tSettings("privacy") },
    { href: "/settings/analytics", icon: BarChart3, label: tSettings("analytics") },
    { href: "/settings/about", icon: Info, label: tSettings("about") },
  ];

  if (status === "loading") {
    return (
      <SettingsShell title={tSettings("title")} currentSectionLabel={tSettings("account")} sidebar={sidebarItemsEarly} mobileNavItems={mobileNavItems}>
        <div className="space-y-4" aria-label="Loading account settings">
          <div className="h-7 w-48 rounded bg-muted animate-pulse-fast" />
          <div className="h-4 w-72 rounded bg-muted animate-pulse-fast" />
          <div className="rounded-lg border border-border bg-card p-6 space-y-3">
            <div className="h-4 w-1/3 rounded bg-muted animate-pulse-fast" />
            <div className="h-10 w-full rounded bg-muted animate-pulse-fast" />
            <div className="h-10 w-full rounded bg-muted animate-pulse-fast" />
          </div>
        </div>
      </SettingsShell>
    );
  }

  const sidebarItems: SettingsNavItem[] = [
    { href: "/settings/search", icon: Search, label: tSettings("search") },
    { href: "/settings/account", icon: User, label: tSettings("account"), active: true },
    { href: "/settings/privacy", icon: Shield, label: tSettings("privacy") },
    { href: "/settings/analytics", icon: BarChart3, label: tSettings("analytics") },
    { href: "/settings/about", icon: Info, label: tSettings("about") },
  ];

  if (!user) {
    return (
      <SettingsShell title={tSettings("title")} currentSectionLabel={tSettings("account")} sidebar={sidebarItems} mobileNavItems={mobileNavItems}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="w-12 h-12 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{tAccount("accessDenied.title")}</h1>
            <p className="text-muted-foreground mb-6">{tAccount("accessDenied.description")}</p>
            <Link 
              href="/auth/signin" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              {tAuth("signIn")}
            </Link>
          </div>
        </div>
      </SettingsShell>
    );
  }

  const userAvatarUrl = getUserAvatarUrl({
    id: user.id,
    image: user.image || user.avatar,
    imageType: user.imageType,
    email: user.email,
    name: user.name,
    updatedAt: user.updatedAt ? new Date(user.updatedAt) : undefined
  });

  return (
  <SettingsShell title={tSettings("title")} currentSectionLabel={tSettings("account")} sidebar={sidebarItems} mobileNavItems={mobileNavItems}>
            <div className="space-y-8">
              {/* Page Title and Description */}
              <div>
                <h2 className="text-3xl font-bold tracking-tight">{tAccount("pageTitle")}</h2>
                <p className="text-muted-foreground mt-2">
                  {tAccount("pageDescription")}
                </p>
              </div>

              {/* Settings Cards */}
              <div className="space-y-6">
                {/* Profile Picture */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="text-lg font-medium mb-6">{tAccount("profilePicture.title")}</h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Image Upload Section */}
                    <div>
                      <ImageUpload
                        key={`avatar-upload-${avatarRefreshKey}`}
                        currentImage={userAvatarUrl}
                        onImageUpload={handleUploadAvatar}
                        onImageRemove={handleRemoveAvatar}
                        disabled={isUploadingAvatar || isLoading}
                        size={120}
                      />
                    </div>
                    
                    {/* Alternative Options */}
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">{tAccount("profilePicture.alternativeTitle")}</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          {tAccount("profilePicture.alternativeDescription")}
                        </p>
                        
                        <button
                          onClick={handleRegenerateAvatar}
                          disabled={isRegeneratingAvatar || isLoading || isUploadingAvatar}
                          className="inline-flex items-center gap-2 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 px-4 py-2 rounded-lg border"
                        >
                          <RefreshCw className="w-4 h-4" aria-hidden="true" />
                          {tAccount("profilePicture.generateButton")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tekir Plus Subscription */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="text-lg font-medium mb-6">{tSubscription("title")}</h3>
                  <SubscriptionManager />
                </div>

                {/* Email Settings */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="text-lg font-medium mb-4">{tAccount("emailSection.title")}</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-2">
                        {tAccount("emailSection.label")}
                      </label>
            <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="flex-1 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder={tAccount("emailSection.placeholder")}
                        />
                        <button
                          onClick={handleEmailUpdate}
                          disabled={isLoading || email === user?.email}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center sm:justify-start gap-2"
                        >
                          <Save className="w-4 h-4" />
                          {tAccount("emailSection.button")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Name Settings */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="text-lg font-medium mb-4">{tAccount("nameSection.title")}</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium mb-2">
                        {tAccount("nameSection.label")}
                      </label>
                      <p className="text-sm text-muted-foreground mb-3">
                        {tAccount("nameSection.description")}
                      </p>
            <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          id="name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="flex-1 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder={tAccount("nameSection.placeholder")}
                        />
                        <button
                          onClick={handleNameUpdate}
                          disabled={isLoading || name === user?.name}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center sm:justify-start gap-2"
                        >
                          <Save className="w-4 h-4" />
                          {tAccount("nameSection.button")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Username Settings */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="text-lg font-medium mb-4">{tAccount("usernameSection.title")}</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium mb-2">
                        {tAccount("usernameSection.label")}
                      </label>
                      <p className="text-sm text-muted-foreground mb-3">
                        {tAccount("usernameSection.description", { username: username || tAccount("usernameSection.placeholder") })}
                      </p>
            <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">@</span>
                          <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-zA-Z0-9_]/g, ''))}
                            className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder={tAccount("usernameSection.placeholder")}
                          />
                        </div>
                        <button
                          onClick={handleUsernameUpdate}
                          disabled={isLoading || username === user?.username}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center sm:justify-start gap-2"
                        >
                          <Save className="w-4 h-4" />
                          {tAccount("usernameSection.button")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Password Settings */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="text-lg font-medium mb-4">{tAccount("passwordSection.title")}</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="current-password" className="block text-sm font-medium mb-2">
                        {tAccount("passwordSection.currentLabel")}
                      </label>
                      <div className="relative">
                        <input
                          id="current-password"
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-3 py-2 pr-12 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder={tAccount("passwordSection.currentPlaceholder")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="new-password" className="block text-sm font-medium mb-2">
                        {tAccount("passwordSection.newLabel")}
                      </label>
                      <div className="relative">
                        <input
                          id="new-password"
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-3 py-2 pr-12 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder={tAccount("passwordSection.newPlaceholder")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="confirm-password" className="block text-sm font-medium mb-2">
                        {tAccount("passwordSection.confirmLabel")}
                      </label>
                      <div className="relative">
                        <input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-3 py-2 pr-12 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder={tAccount("passwordSection.confirmPlaceholder")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handlePasswordChange}
                      disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
                      className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      {tAccount("passwordSection.button")}
                    </button>
                  </div>
                </div>

                {/* Settings Sync */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="text-lg font-medium mb-4">{tAccount("syncSection.title")}</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {tAccount("syncSection.description")}
                      </p>
                      
                      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Cloud className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{tAccount("syncSection.cardTitle")}</div>
                            <div className="text-sm text-muted-foreground">
                              {syncEnabled 
                                ? tAccount("syncSection.statusEnabled")
                                : tAccount("syncSection.statusDisabled")
                              }
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            id="settings-sync-toggle" 
                            className="sr-only" 
                            checked={syncEnabled}
                            onChange={handleSettingsSyncToggle}
                            disabled={isLoading || !isInitialized}
                          />
                          <label 
                            htmlFor="settings-sync-toggle" 
                            className={`relative inline-block w-12 h-6 rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${
                              syncEnabled ? 'bg-emerald-500' : 'bg-muted'
                            } ${(isLoading || !isInitialized) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div
                              className={`absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full transition-transform duration-200 ease-in-out shadow-sm ${
                                syncEnabled ? "translate-x-6" : ""
                              }`}
                            />
                          </label>
                        </div>
                      </div>
                      
                      {syncEnabled && (
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            {tAccount.rich("syncSection.syncedList", {
                              strong: (chunks) => <strong>{chunks}</strong>,
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-6">
                  <h3 className="text-lg font-medium text-red-800 dark:text-red-200 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    {tAccount("dangerZone.title")}
                  </h3>
                  
                  {!showDeleteConfirm ? (
                    <div className="space-y-4">
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {tAccount("dangerZone.description")}
                      </p>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        {tAccount("dangerZone.deleteButton")}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {tAccount.rich("dangerZone.confirmPrompt", {
                          strong: (chunks) => <strong>{chunks}</strong>,
                          phrase: deleteConfirmPhrase,
                        })}
                      </p>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder={tAccount("dangerZone.placeholder", { phrase: deleteConfirmPhrase })}
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={handleDeleteAccount}
                          disabled={isLoading || deleteConfirmText !== deleteConfirmPhrase}
                          className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          {tAccount("dangerZone.confirmButton")}
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteConfirmText("");
                          }}
                          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          {tCommon("cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
  </SettingsShell>
  );
}
