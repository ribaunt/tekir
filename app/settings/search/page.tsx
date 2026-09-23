"use client";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, User, Shield, MessageCircleMore, Lock, MapPin, X, Info, BarChart3 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import SearchCache from "@/lib/cache";
import { useSettings } from "@/lib/settings";
import { locales, localeMetadata, defaultLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsShell, type SettingsNavItem, type MobileNavItem } from "@/components/settings/settings-shell";
import { useAuth } from "@/components/auth-provider";
import { LogoSelector, type LogoOption } from "@/components/settings/logo-selector";

interface LocationData {
  lat: number;
  lon: number;
  name: string;
  country: string;
}

// Countries/regions data
const COUNTRIES = [
  { code: "ALL", name: "All Regions" },
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "HK", name: "Hong Kong" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "Korea" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NO", name: "Norway" },
  { code: "CN", name: "Peoples Republic of China" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "PH", name: "Republic of the Philippines" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "ZA", name: "South Africa" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TR", name: "Turkey" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" }
];

type SearchProviderOption = {
  value: 'brave' | 'you' | 'google';
  labelKey: string;
  descriptionKey: string;
  requiresAuth?: boolean;
  capabilities: string[];
};

const SEARCH_PROVIDER_OPTIONS: SearchProviderOption[] = [
  {
    value: 'brave',
    labelKey: 'sections.searchOptions.searchProviderOptions.brave.label',
    descriptionKey: 'sections.searchOptions.searchProviderOptions.brave.description',
    capabilities: ['Search', 'Images', 'News', 'Videos'],
  },
  {
    value: 'you',
    labelKey: 'sections.searchOptions.searchProviderOptions.you.label',
    descriptionKey: 'sections.searchOptions.searchProviderOptions.you.description',
    capabilities: ['Search'],
  },
  {
    value: 'google',
    labelKey: 'sections.searchOptions.searchProviderOptions.google.label',
    descriptionKey: 'sections.searchOptions.searchProviderOptions.google.description',
    requiresAuth: true,
    capabilities: ['Search', 'Images'],
  },
];

const MODEL_METADATA: Record<string, { icon: string; key: string; className?: string }> = {
  llama: { icon: '/logos/meta.svg', key: 'llama' },
  mistral: { icon: '/logos/mistral.svg', key: 'mistral' },
  claude: { icon: '/logos/claude.svg', key: 'claude' },
  chatgpt: { icon: '/logos/openai.svg', key: 'chatgpt', className: 'invert dark:invert-0' },
  grok: { icon: '/logos/grok.svg', key: 'grok', className: 'invert dark:invert-0' },
  gemini: { icon: '/logos/gemini.svg', key: 'gemini' },
};

const MODEL_ORDER = ['llama', 'gemini', 'claude', 'chatgpt', 'mistral', 'grok'] as const;

export default function SearchSettingsPage() {
  const tSettings = useTranslations("settings");
  const tSearchPage = useTranslations("settings.searchPage");
  const mobileNavItems: MobileNavItem[] = [
    {
      href: "/",
      icon: Search,
      label: tSearchPage("mobileNav.back"),
    },
    {
      href: "https://chat.tekir.co",
      icon: MessageCircleMore,
      label: tSearchPage("mobileNav.chat"),
    },
    {
      href: "/about",
      icon: Lock,
      label: tSearchPage("mobileNav.privacy"),
    },
  ];
  // Use the settings hook for centralized state management
  const { settings, updateSetting, isInitialized, isSyncing, syncEnabled } = useSettings();
  const { status: authStatus, user } = useAuth();
  const isAuthenticated = authStatus === "authenticated" && !!user;
  
  // Local UI state
  const [weatherLocationQuery, setWeatherLocationQuery] = useState("");
  const [weatherLocationSuggestions, setWeatherLocationSuggestions] = useState<LocationData[]>([]);
  const [showWeatherLocationSuggestions, setShowWeatherLocationSuggestions] = useState(false);

  // Dropdown states
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [autocompleteDropdownOpen, setAutocompleteDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [safesearchDropdownOpen, setSafesearchDropdownOpen] = useState(false);
  const [weatherUnitsDropdownOpen, setWeatherUnitsDropdownOpen] = useState(false);
  const [weatherPlacementDropdownOpen, setWeatherPlacementDropdownOpen] = useState(false);
  const [searchProviderDropdownOpen, setSearchProviderDropdownOpen] = useState(false);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  // Refs for click outside handling
  const autocompleteDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const safesearchDropdownRef = useRef<HTMLDivElement>(null);
  const weatherLocationRef = useRef<HTMLDivElement>(null);
  const weatherUnitsDropdownRef = useRef<HTMLDivElement>(null);
  const weatherPlacementDropdownRef = useRef<HTMLDivElement>(null);
  const searchProviderDropdownRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const mobileSettingsRef = useRef<HTMLDivElement>(null);

  // Reset cache cleared state after 3 seconds
  useEffect(() => {
    if (cacheCleared) {
      const timer = setTimeout(() => {
  setCacheCleared(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [cacheCleared]);

  useEffect(() => {
    document.title = `${tSearchPage("metaTitle")} | Tekir`;
  }, [tSearchPage]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteDropdownRef.current &&
          !autocompleteDropdownRef.current.contains(event.target as Node) &&
          autocompleteDropdownOpen) {
        setAutocompleteDropdownOpen(false);
      }

      if (modelDropdownRef.current &&
          !modelDropdownRef.current.contains(event.target as Node) &&
          modelDropdownOpen) {
        setModelDropdownOpen(false);
      }

      if (countryDropdownRef.current &&
          !countryDropdownRef.current.contains(event.target as Node) &&
          countryDropdownOpen) {
        setCountryDropdownOpen(false);
      }

      if (safesearchDropdownRef.current &&
          !safesearchDropdownRef.current.contains(event.target as Node) &&
          safesearchDropdownOpen) {
        setSafesearchDropdownOpen(false);
      }

      if (weatherLocationRef.current &&
          !weatherLocationRef.current.contains(event.target as Node) &&
          showWeatherLocationSuggestions) {
        setShowWeatherLocationSuggestions(false);
      }

      if (weatherUnitsDropdownRef.current &&
          !weatherUnitsDropdownRef.current.contains(event.target as Node) &&
          weatherUnitsDropdownOpen) {
        setWeatherUnitsDropdownOpen(false);
      }

      if (weatherPlacementDropdownRef.current &&
          !weatherPlacementDropdownRef.current.contains(event.target as Node) &&
          weatherPlacementDropdownOpen) {
        setWeatherPlacementDropdownOpen(false);
      }

      if (searchProviderDropdownRef.current &&
          !searchProviderDropdownRef.current.contains(event.target as Node) &&
          searchProviderDropdownOpen) {
        setSearchProviderDropdownOpen(false);
      }

      if (languageDropdownRef.current &&
          !languageDropdownRef.current.contains(event.target as Node) &&
          languageDropdownOpen) {
        setLanguageDropdownOpen(false);
      }

      if (mobileSettingsRef.current && !mobileSettingsRef.current.contains(event.target as Node)) {
        setIsMobileSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [autocompleteDropdownOpen, modelDropdownOpen, countryDropdownOpen, safesearchDropdownOpen, showWeatherLocationSuggestions, weatherUnitsDropdownOpen, weatherPlacementDropdownOpen, searchProviderDropdownOpen, languageDropdownOpen]);

  // Handlers for settings changes
  const handleKarakulakToggle = async () => {
    const newValue = !settings.karakulakEnabled;
    await updateSetting("karakulakEnabled", newValue);
  };

  const handleClim8Toggle = async () => {
    const newValue = !settings.clim8Enabled;
    await updateSetting("clim8Enabled", newValue);
  };

  const handleRecommendationsToggle = async () => {
    const newValue = !(settings.showRecommendations ?? true);
    await updateSetting("showRecommendations", newValue);
  };

  const handleEnchantedResultsToggle = async () => {
    const newValue = !(settings.enchantedResults ?? true);
    await updateSetting("enchantedResults", newValue);
  };

  const handleWikipediaToggle = async () => {
    const newValue = !(settings.wikipediaEnabled ?? true);
    await updateSetting("wikipediaEnabled", newValue);
  };

  const handleShowFaviconsToggle = async () => {
    await updateSetting("showFavicons", !(settings.showFavicons ?? false));
  };

  // Weather location handlers
  const searchWeatherLocations = async (query: string) => {
    if (query.length < 2) {
      setWeatherLocationSuggestions([]);
      return;
    }

    try {
      const response = await fetch(`https://clim8.tekir.co/api/weather/search?q=${encodeURIComponent(query)}&limit=5`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://tekir.co',
        },
      });

      if (response.ok) {
        const locations = await response.json();
        setWeatherLocationSuggestions(locations);
      } else {
        console.error('Failed to search weather locations:', response.status);
        setWeatherLocationSuggestions([]);
      }
    } catch (error) {
      console.error('Error searching weather locations:', error);
      setWeatherLocationSuggestions([]);
    }
  };

  const handleWeatherLocationInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWeatherLocationQuery(value);
    setShowWeatherLocationSuggestions(true);
    searchWeatherLocations(value);
  };

  const handleWeatherLocationSelect = (location: LocationData) => {
    updateSetting("customWeatherLocation", location);
    setWeatherLocationQuery(`${location.name}, ${location.country}`);
    setShowWeatherLocationSuggestions(false);
  };

  const handleClearWeatherLocation = () => {
    updateSetting("customWeatherLocation", undefined);
    setWeatherLocationQuery("");
  };

  const handleAutocompleteChange = (source: string) => {
    updateSetting("autocompleteSource", source);
    setAutocompleteDropdownOpen(false);
  };

  const handleModelChange = (model: string) => {
    updateSetting("aiModel", model);
    setModelDropdownOpen(false);
  };

  const handleCountryChange = (country: string) => {
    updateSetting("searchCountry", country);
    setCountryDropdownOpen(false);
  };

  const handleSafesearchChange = (safesearchValue: string) => {
    updateSetting("safesearch", safesearchValue);
    setSafesearchDropdownOpen(false);
  };

  const handleLanguageChange = (language: Locale) => {
    void updateSetting("language", language);
    setLanguageDropdownOpen(false);
  };

  const handleLogoChange = (logo: LogoOption) => {
    void updateSetting("selectedLogo", logo);
  };

  const handleSearchProviderChange = (engine: string) => {
    const option = SEARCH_PROVIDER_OPTIONS.find((opt) => opt.value === engine);
    if (!option) {
      setSearchProviderDropdownOpen(false);
      return;
    }
    if (option.requiresAuth && !isAuthenticated) {
      // Prevent guests from selecting providers that require authentication
      setSearchProviderDropdownOpen(false);
      return;
    }

    void updateSetting("searchEngine", option.value);
    setSearchProviderDropdownOpen(false);
  };

  useEffect(() => {
    if (!isAuthenticated && (settings.searchEngine ?? 'brave') === 'google') {
      void updateSetting('searchEngine', 'brave');
    }
  }, [isAuthenticated, settings.searchEngine, updateSetting]);

  const handleWeatherUnitsChange = (units: string) => {
    updateSetting("weatherUnits", units);
    setWeatherUnitsDropdownOpen(false);
  };

  const getModelDisplay = (model: string) => {
    const meta = MODEL_METADATA[model] ?? MODEL_METADATA.gemini;
    return {
      name: tSearchPage(`sections.aiFeatures.options.${meta.key}.name`),
      description: tSearchPage(`sections.aiFeatures.options.${meta.key}.description`),
      icon: meta.icon,
      className: meta.className,
    };
  };

  const rawLanguage = settings.language as string | undefined;
  const resolvedLanguage = rawLanguage && (locales as readonly string[]).includes(rawLanguage)
    ? (rawLanguage as Locale)
    : defaultLocale;
  const currentLanguageMeta = localeMetadata[resolvedLanguage] ?? localeMetadata[defaultLocale];

  const currentModel = getModelDisplay(settings.aiModel || 'gemini');
  const currentCountry = COUNTRIES.find(country => country.code === settings.searchCountry) || COUNTRIES[0];

  const selectedSearchEngine = settings.searchEngine ?? 'brave';
  const selectedProviderOption = SEARCH_PROVIDER_OPTIONS.find((option) => option.value === selectedSearchEngine);
  const selectedProviderLabel = selectedProviderOption && (!selectedProviderOption.requiresAuth || isAuthenticated)
    ? tSearchPage(selectedProviderOption.labelKey)
    : tSearchPage('sections.searchOptions.searchProviderOptions.brave.label');
  const resolvedProviderCapabilities = selectedProviderOption && (!selectedProviderOption.requiresAuth || isAuthenticated)
    ? selectedProviderOption.capabilities
    : (SEARCH_PROVIDER_OPTIONS.find((option) => option.value === 'brave')?.capabilities ?? []);
  const selectedProviderCapabilitiesLabel = resolvedProviderCapabilities.length > 0
    ? resolvedProviderCapabilities.map((capability) => tSearchPage(`sections.searchOptions.capabilities.${capability}`)).join(' • ')
    : '';
  const weatherUnitKey = settings.weatherUnits === 'imperial' ? 'imperial' : 'metric';
  const weatherUnitsDisplay = `${tSearchPage(`sections.externalServices.weatherUnits.${weatherUnitKey}.label`)} (${tSearchPage(`sections.externalServices.weatherUnits.${weatherUnitKey}.subtitle`)})`;
  const weatherPlacementKey = (settings.weatherPlacement || 'topRight') === 'hero' ? 'hero' : 'topRight';
  const safeSearchLevels = {
    off: {
      label: tSearchPage('sections.searchOptions.safeSearchLevels.off.label'),
      description: tSearchPage('sections.searchOptions.safeSearchLevels.off.description'),
    },
    moderate: {
      label: tSearchPage('sections.searchOptions.safeSearchLevels.moderate.label'),
      description: tSearchPage('sections.searchOptions.safeSearchLevels.moderate.description'),
    },
    strict: {
      label: tSearchPage('sections.searchOptions.safeSearchLevels.strict.label'),
      description: tSearchPage('sections.searchOptions.safeSearchLevels.strict.description'),
    },
  } as const;

  const getSafesearchDisplay = (value: string) => (safeSearchLevels[value as keyof typeof safeSearchLevels] || safeSearchLevels.moderate).label;

  const sidebarItems: SettingsNavItem[] = [
    { href: "/settings/search", icon: Search, label: tSettings('search'), active: true },
    { href: "/settings/account", icon: User, label: tSettings('account') },
    { href: "/settings/privacy", icon: Shield, label: tSettings('privacy') },
    { href: "/settings/analytics", icon: BarChart3, label: tSettings('analytics') },
    { href: "/settings/about", icon: Info, label: tSettings('about') },
  ];

  return (
    <SettingsShell title={tSettings('title')} currentSectionLabel={tSettings('search')} sidebar={sidebarItems} mobileNavItems={mobileNavItems}>
            <div className="space-y-8">
              {/* Page Title and Description */}
              <div>
                <h2 className="text-3xl font-bold tracking-tight">{tSearchPage('pageTitle')}</h2>
                <p className="text-muted-foreground mt-2">
                  {tSearchPage('pageDescription')}
                </p>
              </div>          
          
          {/* Settings Categories */}
          <div className="space-y-8">
            
            {/* AI Features Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{tSearchPage('sections.aiFeatures.title')}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {tSearchPage('sections.aiFeatures.description')}
                </p>
              </div>
              
              <div className="space-y-4">
                {/* Karakulak AI Mode */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-medium">{tSearchPage('sections.aiFeatures.karakulakTitle')}</h4>
                        {isSyncing && syncEnabled && (
                          <div className="w-3 h-3 rounded-full bg-muted animate-pulse-fast" aria-label="Syncing"></div>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tSearchPage('sections.aiFeatures.karakulakDescription')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={settings.karakulakEnabled} onChange={() => { void handleKarakulakToggle(); }} aria-label={tSearchPage('sections.aiFeatures.karakulakAria')} />
                    </div>
                  </div>
                </div>

                {/* AI Model Selection */}
                {settings.karakulakEnabled && (
                  <div className="rounded-lg border border-border bg-card p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-lg font-medium">{tSearchPage('sections.aiFeatures.modelTitle')}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {tSearchPage('sections.aiFeatures.modelDescription')}
                        </p>
                      </div>
            <div className="relative w-full sm:w-auto" ref={modelDropdownRef}>
                        <button
                          onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors w-full sm:w-auto sm:min-w-[200px] justify-between"
              aria-haspopup="menu"
              aria-expanded={modelDropdownOpen}
              aria-controls="ai-model-menu"
                          aria-label={tSearchPage('sections.aiFeatures.modelMenuLabel')}
                        >
                          <div className="flex items-center gap-2">
                            <Image
                              src={currentModel.icon}
                              alt={`${currentModel.name} Logo`}
                              width={20}
                              height={20}
                              className={`rounded ${currentModel.className ?? ''}`}
                            />
                            <span className="text-sm font-medium">{currentModel.name}</span>
                          </div>
                          <ChevronDown className={`w-4 h-4 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {modelDropdownOpen && (
                          <div id="ai-model-menu" role="menu" aria-label={tSearchPage('sections.aiFeatures.modelMenuLabel')} className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-80 rounded-lg bg-background border border-border shadow-lg z-10">
                            <div className="p-1">
                              {MODEL_ORDER.map((modelKey) => {
                                const meta = MODEL_METADATA[modelKey];
                                const isSelected = (settings.aiModel || 'gemini') === modelKey;
                                return (
                                  <button
                                    key={modelKey}
                                    onClick={() => handleModelChange(modelKey)}
                                    role="menuitemradio"
                                    aria-checked={isSelected}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-md hover:bg-muted transition-colors ${
                                      isSelected ? 'bg-muted' : ''
                                    }`}
                                  >
                                    <Image src={meta.icon} alt={`${tSearchPage(`sections.aiFeatures.options.${meta.key}.name`)} Logo`} width={24} height={24} className={`rounded ${meta.className ?? ''}`} />
                                    <div className="flex flex-col items-start flex-1">
                                      <span className="font-medium text-sm">{tSearchPage(`sections.aiFeatures.options.${meta.key}.name`)}</span>
                                      <span className="text-xs text-muted-foreground text-left">{tSearchPage(`sections.aiFeatures.options.${meta.key}.description`)}</span>
                                    </div>
                                    {isSelected && (
                                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* UI & Language Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{tSearchPage('sections.uiLanguage.title')}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {tSearchPage('sections.uiLanguage.description')}
                </p>
              </div>
              
              <div className="space-y-4">
                {/* Language Preference */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-lg font-medium">{tSearchPage('sections.uiLanguage.languageTitle')}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tSearchPage('sections.uiLanguage.languageDescription')}
                      </p>
                    </div>
                    <div className="relative w-full sm:w-auto" ref={languageDropdownRef}>
                      <button
                        onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
                        className="flex items-center gap-3 px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors w-full sm:w-auto sm:min-w-[200px] justify-between"
                        aria-haspopup="menu"
                        aria-expanded={languageDropdownOpen}
                        aria-controls="language-menu"
                        aria-label={tSearchPage('sections.uiLanguage.languageMenuLabel')}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg" aria-hidden="true">{currentLanguageMeta.flag}</span>
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-medium">{currentLanguageMeta.nativeName ?? currentLanguageMeta.name}</span>
                            <span className="text-xs text-muted-foreground">{currentLanguageMeta.name}</span>
                          </div>
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${languageDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {languageDropdownOpen && (
                        <div
                          id="language-menu"
                          role="menu"
                          aria-label={tSearchPage('sections.uiLanguage.languageMenuLabel')}
                          className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-72 rounded-lg bg-background border border-border shadow-lg z-10"
                        >
                          <div className="p-1 space-y-1">
                            {locales.map((locale) => {
                              const localeKey = locale as Locale;
                              const meta = localeMetadata[localeKey];
                              const isSelected = resolvedLanguage === localeKey;
                              return (
                                <button
                                  key={localeKey}
                                  onClick={() => handleLanguageChange(localeKey)}
                                  role="menuitemradio"
                                  aria-checked={isSelected}
                                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                                    isSelected ? 'bg-muted' : ''
                                  }`}
                                >
                                  <span className="text-xl" aria-hidden="true">{meta.flag}</span>
                                  <div className="flex flex-col items-start flex-1">
                                    <span className="font-medium text-sm">{meta.nativeName ?? meta.name}</span>
                                    <span className="text-xs text-muted-foreground">{meta.name}</span>
                                  </div>
                                  {isSelected && <div className="w-2 h-2 bg-primary rounded-full" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Logo Selection */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-lg font-medium">{tSearchPage('sections.uiLanguage.logoTitle')}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tSearchPage('sections.uiLanguage.logoDescription')}
                      </p>
                    </div>
                    <div className="w-full sm:w-auto">
                      <LogoSelector 
                        selectedLogo={settings.selectedLogo || 'tekir'}
                        onLogoChange={handleLogoChange}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* External Services Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{tSearchPage('sections.externalServices.title')}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {tSearchPage('sections.externalServices.description')}
                </p>
              </div>
              
              <div className="space-y-4">

            {/* Clim8 Weather Service */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-lg font-medium">{tSearchPage('sections.externalServices.clim8Title')}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tSearchPage('sections.externalServices.clim8Description')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={settings.clim8Enabled} onChange={() => { void handleClim8Toggle(); }} aria-label={tSearchPage('sections.externalServices.clim8Aria')} />
                </div>
              </div>
            </div>

            {/* Custom Weather Location */}
            {settings.clim8Enabled && (
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">{tSearchPage('sections.externalServices.customWeatherTitle')}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tSearchPage('sections.externalServices.customWeatherDescription')}
                    </p>
                  </div>
                  
      <div className="relative" ref={weatherLocationRef}>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder={tSearchPage('sections.externalServices.locationPlaceholder')}
                        value={weatherLocationQuery}
                        onChange={handleWeatherLocationInput}
                        onFocus={() => setShowWeatherLocationSuggestions(true)}
                        className="w-full pl-10 pr-10"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showWeatherLocationSuggestions && weatherLocationSuggestions.length > 0}
        aria-controls="weather-location-suggestions"
                      />
                      {settings.customWeatherLocation && (
                        <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={handleClearWeatherLocation} aria-label={tSearchPage('sections.externalServices.clearLocation')}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    {/* Location suggestions dropdown */}
                    {showWeatherLocationSuggestions && weatherLocationSuggestions.length > 0 && (
                      <div id="weather-location-suggestions" role="listbox" aria-label={tSearchPage('sections.externalServices.suggestionsLabel')} className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                        {weatherLocationSuggestions.map((location, index) => (
                          <button
                            key={index}
                            onClick={() => handleWeatherLocationSelect(location)}
                            role="option"
                            aria-selected={false}
                            className="w-full px-4 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2"
                          >
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <span>{location.name}, {location.country}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {settings.customWeatherLocation && (
                      <div className="mt-2 p-2 bg-muted rounded-md flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          {tSearchPage('sections.externalServices.selectedLabel', {
                            location: `${settings.customWeatherLocation.name}, ${settings.customWeatherLocation.country}`
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Weather Units */}
            {settings.clim8Enabled && (
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-lg font-medium">{tSearchPage('sections.externalServices.weatherUnitsTitle')}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tSearchPage('sections.externalServices.weatherUnitsDescription')}
                    </p>
                  </div>
          <div className="relative w-full sm:w-auto" ref={weatherUnitsDropdownRef}>
                    <button
                      onClick={() => setWeatherUnitsDropdownOpen(!weatherUnitsDropdownOpen)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors w-full sm:w-auto sm:min-w-[140px] justify-between"
            aria-haspopup="menu"
            aria-expanded={weatherUnitsDropdownOpen}
            aria-controls="weather-units-menu"
                    >
                      <span className="text-sm font-medium capitalize">{weatherUnitsDisplay}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${weatherUnitsDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {weatherUnitsDropdownOpen && (
                      <div id="weather-units-menu" role="menu" aria-label={tSearchPage('sections.externalServices.weatherUnitsMenuLabel')} className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-60 rounded-lg bg-background border border-border shadow-lg z-10">
                        <div className="p-1">
                          <button
                            onClick={() => handleWeatherUnitsChange('metric')}
                            role="menuitemradio"
                            aria-checked={settings.weatherUnits === 'metric'}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                              settings.weatherUnits === 'metric' ? 'bg-muted' : ''
                            }`}
                          >
                            <div className="flex flex-col items-start flex-1">
                              <span className="font-medium text-sm">{tSearchPage('sections.externalServices.weatherUnits.metric.label')}</span>
                              <span className="text-xs text-muted-foreground">{tSearchPage('sections.externalServices.weatherUnits.metric.subtitle')}</span>
                            </div>
                            {settings.weatherUnits === 'metric' && (
                              <div className="w-2 h-2 bg-primary rounded-full"></div>
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleWeatherUnitsChange('imperial')}
                            role="menuitemradio"
                            aria-checked={settings.weatherUnits === 'imperial'}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                              settings.weatherUnits === 'imperial' ? 'bg-muted' : ''
                            }`}
                          >
                            <div className="flex flex-col items-start flex-1">
                              <span className="font-medium text-sm">{tSearchPage('sections.externalServices.weatherUnits.imperial.label')}</span>
                              <span className="text-xs text-muted-foreground">{tSearchPage('sections.externalServices.weatherUnits.imperial.subtitle')}</span>
                            </div>
                            {settings.weatherUnits === 'imperial' && (
                              <div className="w-2 h-2 bg-primary rounded-full"></div>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Weather Placement */}
            {settings.clim8Enabled && (
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-lg font-medium">{tSearchPage('sections.externalServices.weatherPlacementTitle')}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tSearchPage('sections.externalServices.weatherPlacementDescription')}
                    </p>
                  </div>
                  <div className="relative w-full sm:w-auto" ref={weatherPlacementDropdownRef}>
                    <button
                      onClick={() => setWeatherPlacementDropdownOpen(!weatherPlacementDropdownOpen)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors w-full sm:w-auto sm:min-w-[200px] justify-between"
                      aria-haspopup="menu"
                      aria-expanded={weatherPlacementDropdownOpen}
                      aria-controls="weather-placement-menu"
                      aria-label={tSearchPage('sections.externalServices.weatherPlacementMenuLabel')}
                    >
                      <span className="text-sm font-medium">
                        {tSearchPage(`sections.externalServices.weatherPlacement.${weatherPlacementKey}.label`)}
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${weatherPlacementDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {weatherPlacementDropdownOpen && (
                      <div id="weather-placement-menu" role="menu" aria-label={tSearchPage('sections.externalServices.weatherPlacementMenuLabel')} className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-72 rounded-lg bg-background border border-border shadow-lg z-10">
                        <div className="p-1">
                          <button
                            onClick={() => { updateSetting('weatherPlacement', 'hero'); setWeatherPlacementDropdownOpen(false); }}
                            role="menuitemradio"
                aria-checked={weatherPlacementKey === 'hero'}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                  weatherPlacementKey === 'hero' ? 'bg-muted' : ''
                            }`}
                          >
                            <div className="flex flex-col items-start flex-1">
                              <span className="font-medium text-sm">{tSearchPage('sections.externalServices.weatherPlacement.hero.label')}</span>
                              <span className="text-xs text-muted-foreground">{tSearchPage('sections.externalServices.weatherPlacement.hero.description')}</span>
                            </div>
                            {weatherPlacementKey === 'hero' && (
                              <div className="w-2 h-2 bg-primary rounded-full"></div>
                            )}
                          </button>
                          <button
                            onClick={() => { updateSetting('weatherPlacement', 'topRight'); setWeatherPlacementDropdownOpen(false); }}
                            role="menuitemradio"
                            aria-checked={weatherPlacementKey === 'topRight'}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                              weatherPlacementKey === 'topRight' ? 'bg-muted' : ''
                            }`}
                          >
                            <div className="flex flex-col items-start flex-1">
                              <span className="font-medium text-sm">{tSearchPage('sections.externalServices.weatherPlacement.topRight.label')}</span>
                              <span className="text-xs text-muted-foreground">{tSearchPage('sections.externalServices.weatherPlacement.topRight.description')}</span>
                            </div>
                            {weatherPlacementKey === 'topRight' && (
                              <div className="w-2 h-2 bg-primary rounded-full"></div>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
              </div>
            </div>

            {/* Search Options Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{tSearchPage('sections.searchOptions.title')}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {tSearchPage('sections.searchOptions.description')}
                </p>
              </div>
              
              <div className="space-y-4">

              {/* Enchanted Results (News & Videos) */}
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-lg font-medium">{tSearchPage('sections.searchOptions.enchantedTitle')}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tSearchPage('sections.searchOptions.enchantedDescription')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={settings.enchantedResults ?? true} onChange={() => { void handleEnchantedResultsToggle(); }} aria-label={tSearchPage('sections.searchOptions.enchantedAria')} />
                  </div>
                </div>
              </div>

              {/* Wikipedia Results */}
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-lg font-medium">{tSearchPage('sections.searchOptions.wikipediaTitle')}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tSearchPage('sections.searchOptions.wikipediaDescription')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={settings.wikipediaEnabled ?? true} onChange={() => { void handleWikipediaToggle(); }} aria-label={tSearchPage('sections.searchOptions.wikipediaAria')} />
                  </div>
                </div>
              </div>

              {/* Favicons in Results */}
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-lg font-medium">{tSearchPage('sections.searchOptions.faviconsTitle')}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tSearchPage('sections.searchOptions.faviconsDescription')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={settings.showFavicons ?? false} onChange={() => { void handleShowFaviconsToggle(); }} aria-label={tSearchPage('sections.searchOptions.faviconsAria')} />
                  </div>
                </div>
              </div>

            {/* Homepage Recommendations */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-lg font-medium">{tSearchPage('sections.searchOptions.recommendationsTitle')}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tSearchPage('sections.searchOptions.recommendationsDescription')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={settings.showRecommendations ?? true}
                    onChange={() => { void handleRecommendationsToggle(); }}
                    aria-label={tSearchPage('sections.searchOptions.recommendationsAria')}
                  />
                </div>
              </div>
            </div>

            {/* Search Provider */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-lg font-medium">{tSearchPage('sections.searchOptions.searchProviderTitle')}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tSearchPage('sections.searchOptions.searchProviderDescription')}
                  </p>
                </div>
                <div className="relative w-full sm:w-auto" ref={searchProviderDropdownRef}>
                  <button
                    onClick={() => setSearchProviderDropdownOpen(!searchProviderDropdownOpen)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors w-full sm:w-auto sm:min-w-[200px] justify-between"
                    aria-haspopup="menu"
                    aria-expanded={searchProviderDropdownOpen}
                    aria-controls="search-provider-menu"
                    aria-label={tSearchPage('sections.searchOptions.searchProviderMenuLabel')}
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">
                        {selectedProviderLabel}
                      </span>
                      {selectedProviderCapabilitiesLabel && (
                        <span className="text-xs text-muted-foreground">{selectedProviderCapabilitiesLabel}</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${searchProviderDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {searchProviderDropdownOpen && (
                    <div
                      id="search-provider-menu"
                      role="menu"
                      aria-label={tSearchPage('sections.searchOptions.searchProviderMenuLabel')}
                      className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-72 rounded-lg bg-background border border-border shadow-lg z-10"
                    >
                      <div className="p-1 space-y-1">
                        {SEARCH_PROVIDER_OPTIONS.map((option) => {
                          const isSelected = selectedSearchEngine === option.value;
                          const label = tSearchPage(option.labelKey);
                          const description = tSearchPage(option.descriptionKey);
                          const capabilityLabels = option.capabilities.map((capability) => tSearchPage(`sections.searchOptions.capabilities.${capability}`));

                          if (option.requiresAuth && !isAuthenticated) {
                            return (
                              <div
                                key={option.value}
                                className="w-full flex items-start gap-3 px-3 py-2 rounded-md bg-muted/60 text-muted-foreground text-xs"
                              >
                                <div className="mt-1 w-2 h-2 rounded-full bg-border" />
                                <div className="flex-1">
                                  <span className="font-medium text-sm block">{label}</span>
                                  <span>{tSearchPage('sections.searchOptions.searchProviderSigninNotice', { provider: label })}</span>
                                  {capabilityLabels.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {capabilityLabels.map((capability) => (
                                        <span
                                          key={capability}
                                          className="rounded-full bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                                        >
                                          {capability}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={option.value}
                              onClick={() => handleSearchProviderChange(option.value)}
                              role="menuitemradio"
                              aria-checked={isSelected}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                                isSelected ? 'bg-muted' : ''
                              }`}
                            >
                              <div className="flex flex-col items-start flex-1">
                                <span className="font-medium text-sm">{label}</span>
                                <span className="text-xs text-muted-foreground">{description}</span>
                                {capabilityLabels.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {capabilityLabels.map((capability) => (
                                      <span
                                        key={capability}
                                        className="rounded-full bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                                      >
                                        {capability}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <div className="w-2 h-2 bg-primary rounded-full" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Autocomplete Provider */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-lg font-medium">{tSearchPage('sections.searchOptions.autocompleteTitle')}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tSearchPage('sections.searchOptions.autocompleteDescription')}
                  </p>
                </div>
        <div className="relative w-full sm:w-auto" ref={autocompleteDropdownRef}>
                  <button
                    onClick={() => setAutocompleteDropdownOpen(!autocompleteDropdownOpen)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors w-full sm:w-auto sm:min-w-[140px] justify-between"
          aria-haspopup="menu"
          aria-expanded={autocompleteDropdownOpen}
          aria-controls="autocomplete-menu"
                    aria-label={tSearchPage('sections.searchOptions.autocompleteMenuLabel')}
                  >
                    <span className="text-sm font-medium">
                      {tSearchPage(`sections.searchOptions.autocompleteOptions.${settings.autocompleteSource === 'duck' ? 'duck' : 'brave'}`)}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${autocompleteDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {autocompleteDropdownOpen && (
                    <div id="autocomplete-menu" role="menu" aria-label={tSearchPage('sections.searchOptions.autocompleteMenuLabel')} className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:min-w-[140px] rounded-lg bg-background border border-border shadow-lg z-10">
                      <div className="py-1">
                        <button
                          onClick={() => handleAutocompleteChange('brave')}
                          role="menuitemradio"
                          aria-checked={settings.autocompleteSource === 'brave'}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-muted transition-colors ${
                            settings.autocompleteSource === "brave" ? "bg-muted" : ""
                          }`}
                        >
                          <div className="w-4 h-4 flex items-center justify-center">
                            {settings.autocompleteSource === "brave" && (
                              <div className="w-2 h-2 bg-primary rounded-full"></div>
                            )}
                          </div>
                          <span>{tSearchPage('sections.searchOptions.autocompleteOptions.brave')}</span>
                        </button>
                        
                        <button
                          onClick={() => handleAutocompleteChange('duck')}
                          role="menuitemradio"
                          aria-checked={settings.autocompleteSource === 'duck'}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-muted transition-colors ${
                            settings.autocompleteSource === "duck" ? "bg-muted" : ""
                          }`}
                        >
                          <div className="w-4 h-4 flex items-center justify-center">
                            {settings.autocompleteSource === "duck" && (
                              <div className="w-2 h-2 bg-primary rounded-full"></div>
                            )}
                          </div>
                          <span>{tSearchPage('sections.searchOptions.autocompleteOptions.duck')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Search Region/Country */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-lg font-medium">{tSearchPage('sections.searchOptions.searchRegionTitle')}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tSearchPage('sections.searchOptions.searchRegionDescription')}
                  </p>
                </div>
        <div className="relative w-full sm:w-auto" ref={countryDropdownRef}>
                  <button
                    onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors w-full sm:w-auto sm:min-w-[200px] justify-between"
          aria-haspopup="menu"
          aria-expanded={countryDropdownOpen}
          aria-controls="country-menu"
                    aria-label={tSearchPage('sections.searchOptions.searchRegionMenuLabel')}
                  >
                    <span className="text-sm font-medium">{currentCountry.name}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${countryDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {countryDropdownOpen && (
                    <div id="country-menu" role="menu" aria-label={tSearchPage('sections.searchOptions.searchRegionMenuLabel')} className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-80 rounded-lg bg-background border border-border shadow-lg z-10 max-h-60 overflow-y-auto">
                      <div className="p-1">
                        {COUNTRIES.map((country) => (
                          <button
                            key={country.code}
                            onClick={() => handleCountryChange(country.code)}
                            role="menuitemradio"
                            aria-checked={settings.searchCountry === country.code}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                              settings.searchCountry === country.code ? 'bg-muted' : ''
                            }`}
                          >
                            <div className="flex flex-col items-start flex-1">
                              <span className="font-medium text-sm">{country.name}</span>
                              <span className="text-xs text-muted-foreground">{country.code}</span>
                            </div>
                            {settings.searchCountry === country.code && (
                              <div className="w-2 h-2 bg-primary rounded-full"></div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SafeSearch */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-lg font-medium">{tSearchPage('sections.searchOptions.safeSearchTitle')}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tSearchPage('sections.searchOptions.safeSearchDescription')}
                  </p>
                </div>
        <div className="relative w-full sm:w-auto" ref={safesearchDropdownRef}>
                  <button
                    onClick={() => setSafesearchDropdownOpen(!safesearchDropdownOpen)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors w-full sm:w-auto sm:min-w-[140px] justify-between"
          aria-haspopup="menu"
          aria-expanded={safesearchDropdownOpen}
          aria-controls="safesearch-menu"
                    aria-label={tSearchPage('sections.searchOptions.safeSearchMenuLabel')}
                  >
                    <span className="text-sm font-medium">{getSafesearchDisplay(settings.safesearch || 'moderate')}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${safesearchDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {safesearchDropdownOpen && (
                    <div id="safesearch-menu" role="menu" aria-label={tSearchPage('sections.searchOptions.safeSearchMenuLabel')} className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:min-w-[200px] rounded-lg bg-background border border-border shadow-lg z-10">
                      <div className="p-1">
                        <button
                          onClick={() => handleSafesearchChange('off')}
                          role="menuitemradio"
                          aria-checked={settings.safesearch === 'off'}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                            settings.safesearch === 'off' ? 'bg-muted' : ''
                          }`}
                        >
                          <div className="flex flex-col items-start flex-1">
                            <span className="font-medium text-sm">{safeSearchLevels.off.label}</span>
                            <span className="text-xs text-muted-foreground">{safeSearchLevels.off.description}</span>
                          </div>
                          {settings.safesearch === 'off' && (
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                          )}
                        </button>
                        
                        <button
                          onClick={() => handleSafesearchChange('moderate')}
                          role="menuitemradio"
                          aria-checked={settings.safesearch === 'moderate'}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                            settings.safesearch === 'moderate' ? 'bg-muted' : ''
                          }`}
                        >
                          <div className="flex flex-col items-start flex-1">
                            <span className="font-medium text-sm">{safeSearchLevels.moderate.label}</span>
                            <span className="text-xs text-muted-foreground">{safeSearchLevels.moderate.description}</span>
                          </div>
                          {settings.safesearch === 'moderate' && (
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                          )}
                        </button>

                        <button
                          onClick={() => handleSafesearchChange('strict')}
                          role="menuitemradio"
                          aria-checked={settings.safesearch === 'strict'}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left ${
                            settings.safesearch === 'strict' ? 'bg-muted' : ''
                          }`}
                        >
                          <div className="flex flex-col items-start flex-1">
                            <span className="font-medium text-sm">{safeSearchLevels.strict.label}</span>
                            <span className="text-xs text-muted-foreground">{safeSearchLevels.strict.description}</span>
                          </div>
                          {settings.safesearch === 'strict' && (
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
              </div>
            </div>
          </div>

          {/* Cache Management */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold">{tSearchPage('sections.cache.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {tSearchPage('sections.cache.description')}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-lg font-medium">{tSearchPage('sections.cache.clearTitle')}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tSearchPage('sections.cache.clearDescription')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant={cacheCleared ? "default" : "outline"}
                    disabled={false}
                    className={cacheCleared ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}
                    onClick={() => {
                      SearchCache.clearAll();
                      setCacheCleared(true);
                    }}
                    aria-live="polite"
                  >
                    {cacheCleared ? tSearchPage('sections.cache.buttonCleared') : tSearchPage('sections.cache.buttonDefault')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

              {/* Footer Note */}
              <div className="text-center text-sm text-muted-foreground">
                {isSyncing && syncEnabled ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-3 w-24 rounded bg-muted animate-pulse-fast" aria-hidden="true"></div>
                    <p>{tSearchPage('syncStatus.syncing')}</p>
                  </div>
                ) : syncEnabled ? (
                  <p>{tSearchPage('syncStatus.synced')}</p>
                ) : (
                  <p>{tSearchPage('syncStatus.localOnly')}</p>
                )}
              </div>
            </div>
    </SettingsShell>
  );
}
