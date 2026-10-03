'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  getAllProviders,
  getStoredApiConfig,
  getStoredApiConfigAsync,
  saveApiConfig,
  saveApiConfigAsync,
} from '@/lib/providers/registry'
import {
  createEntryId,
  entryLabel,
  loadAppConfig,
  saveAppConfig,
  toLegacyConfig,
  withProviders,
} from '@/lib/config-store'
import { normalizeBaseUrl, validateCustomSettings, parseHeaderLines } from '@/lib/providers/custom-utils'
import {
  ProviderId,
  ApiKeyConfig,
  ProviderEntry,
  ProviderConfig,
  CustomModelEntry,
  CustomProviderSettings,
  CustomApiMode,
  CustomTransport,
} from '@/lib/providers/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Key,
  Check,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Video,
  Pencil,
  Plus,
  Trash2,
  Server,
  RefreshCw,
  Wand2,
} from 'lucide-react'

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  onSave?: (config: ApiKeyConfig) => void
}

const DEFAULT_CUSTOM_SETTINGS: CustomProviderSettings = {
  displayName: '',
  baseUrl: '',
  apiMode: 'images',
  transport: 'direct',
  size: 'auto',
  models: [],
}

// Re-export for backward compatibility
export type { ApiKeyConfig }
export type ApiProvider = ProviderId
export { getStoredApiConfig, getStoredApiConfigAsync, saveApiConfig, saveApiConfigAsync }
export function isApiKeyConfigured(): boolean {
  const config = getStoredApiConfig()
  return !!(config?.provider && (config.apiKey || config.custom?.baseUrl))
}

/** Shared styling for the inputs inside this dialog. */
const inputStyle = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxShadow: 'none',
} as const

/** A model returned by GET {baseUrl}/models, awaiting the user's decision. */
interface FetchedModel {
  id: string
  selected: boolean
}

export default function ApiKeyModal({ isOpen, onClose, onSave }: ApiKeyModalProps) {
  // Initialize state from stored config (lazy initializer runs once on mount)
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(() => {
    if (typeof window !== 'undefined') {
      const config = getStoredApiConfig()
      return config?.provider ?? 'openrouter'
    }
    return 'openrouter'
  })
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [custom, setCustom] = useState<CustomProviderSettings>(DEFAULT_CUSTOM_SETTINGS)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchNote, setFetchNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  // Models discovered via GET {baseUrl}/models, waiting for the user to pick
  // which ones to keep. Nothing is added to the provider until they confirm.
  const [discovered, setDiscovered] = useState<FetchedModel[]>([])

  // Every configured provider. The three fields above are a *draft* of the
  // entry identified by `editingId`; `null` means a new entry is being added.
  const [entries, setEntries] = useState<ProviderEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [persistNote, setPersistNote] = useState<string | null>(null)

  // Show all providers for open source version
  const providers = getAllProviders()

  /** Load an entry into the form fields, or clear them for a new entry. */
  const loadDraft = useCallback((entry: ProviderEntry | null) => {
    setEditingId(entry?.id ?? null)
    setSelectedProvider(entry?.provider ?? 'openrouter')
    setApiKey(entry?.apiKey ?? '')
    setCustom(
      entry?.custom
        ? { ...DEFAULT_CUSTOM_SETTINGS, ...entry.custom }
        : DEFAULT_CUSTOM_SETTINGS
    )
    setDiscovered([])
    setFetchNote(null)
  }, [])

  /** True while the type picker is open for a brand new entry. */
  const [isAdding, setIsAdding] = useState(false)

  // Read the config file (or fall back to the browser copy) and open the
  // currently active provider so reopening never looks like data was lost.
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setDiscovered([])

    const hydrate = async () => {
      const { config, localOnly } = await loadAppConfig()

      if (cancelled) return

      const list = config?.providers ?? []
      setEntries(list)
      // Open with nothing selected: editing is always an explicit choice, so
      // reopening Settings never implies you meant to change something.
      setIsAdding(false)
      setEditingId(null)
      setApiKey('')
      setCustom(DEFAULT_CUSTOM_SETTINGS)
      setPersistNote(
        localOnly
          ? 'Config file unreachable - settings are kept in this browser only.'
          : null
      )
    }

    hydrate()
    return () => {
      cancelled = true
    }
  }, [isOpen, loadDraft])

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setError(null)
    setLoading(false)
    setShowKey(false)
    setFetchNote(null)
    setDiscovered([])
    onClose()
  }, [onClose])

  const handleSave = useCallback(async () => {
    const isCustom = selectedProvider === 'custom'

    if (isCustom) {
      const invalid = validateCustomSettings(custom)
      if (invalid) {
        setError(invalid)
        return
      }
    } else if (!apiKey.trim()) {
      setError('Please enter your API key')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const entry: ProviderEntry = {
        id: editingId ?? createEntryId(),
        provider: selectedProvider,
        apiKey: apiKey.trim(),
      }

      if (isCustom) {
        entry.custom = {
          ...custom,
          baseUrl: normalizeBaseUrl(custom.baseUrl),
          models: custom.models.filter((model) => model.id.trim()),
        }
        entry.label = custom.displayName?.trim() || custom.baseUrl
      }

      // Replace the edited entry, or append it when adding.
      const nextEntries = editingId
        ? entries.map((item) => (item.id === editingId ? entry : item))
        : [...entries, entry]

      // Saving an entry makes it the one used for generation.
      const { localOnly } = await saveAppConfig(
        withProviders({ version: 1, activeProviderId: entry.id, providers: entries }, nextEntries, entry.id)
      )

      setEntries(nextEntries)
      setEditingId(entry.id)
      setIsAdding(false)
      setPersistNote(
        localOnly
          ? 'Config file unreachable - settings are kept in this browser only.'
          : null
      )

      if (onSave) {
        const legacy = toLegacyConfig(entry)
        if (legacy) onSave(legacy)
      }

      setTimeout(() => {
        handleClose()
      }, 300)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save API key'
      setError(errorMessage)
      setLoading(false)
    }
  }, [apiKey, selectedProvider, custom, editingId, entries, onSave, handleClose])

  /** Drop a configured provider from the list. */
  const handleRemoveEntry = useCallback(
    (id: string) => {
      const remaining = entries.filter((item) => item.id !== id)

      setEntries(remaining)
      setPersistNote(null)

      if (editingId === id) {
        const next = remaining[0] ?? null
        setIsAdding(false)
        loadDraft(next)
      }
    },
    [entries, editingId, loadDraft]
  )

  const startNewEntry = useCallback(() => {
    setError(null)
    // Start from a genuinely blank draft: no leftovers from the entry that was
    // open a moment ago.
    setIsAdding(true)
    loadDraft(null)
  }, [loadDraft])

  /** Open an existing entry for editing. */
  const startEditEntry = useCallback(
    (entry: ProviderEntry) => {
      setError(null)
      setIsAdding(false)
      loadDraft(entry)
    },
    [loadDraft]
  )

  /** Leave edit mode without changing anything. */
  const stopEditing = useCallback(() => {
    setError(null)
    setIsAdding(false)
    setEditingId(null)
    setApiKey('')
    setCustom(DEFAULT_CUSTOM_SETTINGS)
    setDiscovered([])
    setFetchNote(null)
  }, [])

  /** Cancel adding and go back to whatever is being edited. */
  const cancelAdding = useCallback(() => {
    setError(null)
    setIsAdding(false)
    const current = entries.find((item) => item.id === editingId)
    loadDraft(current ?? entries[0] ?? null)
  }, [entries, editingId, loadDraft])

  // ===== Custom provider helpers =====

  const updateCustom = useCallback(
    (patch: Partial<CustomProviderSettings>) => {
      setCustom((prev) => ({ ...prev, ...patch }))
      setFetchNote(null)

      // The discovered list belongs to one base URL; changing it invalidates
      // whatever was discovered from the previous endpoint.
      if (patch.baseUrl !== undefined) {
        setDiscovered([])
      }
    },
    []
  )

  const addModel = useCallback(() => {
    setCustom((prev) => ({
      ...prev,
      models: [...prev.models, { id: '', name: '', imageToImage: true }],
    }))
  }, [])

  const updateModel = useCallback((index: number, patch: Partial<CustomModelEntry>) => {
    setCustom((prev) => ({
      ...prev,
      models: prev.models.map((model, i) => (i === index ? { ...model, ...patch } : model)),
    }))
  }, [])

  const removeModel = useCallback((index: number) => {
    setCustom((prev) => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index),
    }))
  }, [])

  /** Model IDs already in the configured list - locked in the checklist. */
  const configuredIds = useMemo(
    () => new Set(custom.models.map((model) => model.id)),
    [custom.models]
  )

  /** Ask the user's endpoint which models it serves (GET {baseUrl}/models). */
  const fetchModels = useCallback(async () => {
    const baseUrl = normalizeBaseUrl(custom.baseUrl)

    if (!baseUrl) {
      setFetchNote({ kind: 'error', text: 'Enter a base URL first' })
      return
    }

    setFetchingModels(true)
    setFetchNote(null)

    try {
      const headers: Record<string, string> = { ...(custom.extraHeaders ?? {}) }
      const key = apiKey.trim()
      if (key) headers['Authorization'] = `Bearer ${key}`

      let response: Response
      try {
        response = await fetch(`${baseUrl}/models`, { headers })
      } catch {
        throw new Error(
          'Blocked by the browser. The endpoint must be reachable and send ' +
            'CORS headers (Access-Control-Allow-Origin) for browser requests.'
        )
      }

      const text = await response.text()

      if (!response.ok) {
        let detail = `HTTP ${response.status}`
        try {
          const parsed = JSON.parse(text)
          detail = parsed?.error?.message || parsed?.message || detail
        } catch {
          /* keep the status code */
        }
        throw new Error(detail)
      }

      const parsed = JSON.parse(text)
      const rawIds: unknown[] = Array.isArray(parsed?.data) ? parsed.data : []
      const ids: string[] = rawIds
        .map((item) =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && 'id' in item
              ? String((item as { id: unknown }).id)
              : ''
        )
        .filter((id) => id.length > 0)

      if (ids.length === 0) {
        setFetchNote({ kind: 'error', text: 'Endpoint reachable, but returned no model IDs' })
        return
      }

      // Hand them over as an unselected list - the user picks what to keep.
      // Anything already configured stays selected and locked so a re-fetch
      // can never silently drop or duplicate it.
      const merged = new Map<string, FetchedModel>()

      for (const id of ids) {
        merged.set(id, { id, selected: configuredIds.has(id) })
      }

      // Keep manually-added entries that the endpoint did not report.
      for (const id of configuredIds) {
        if (!merged.has(id)) {
          merged.set(id, { id, selected: true })
        }
      }

      setDiscovered(Array.from(merged.values()))
      setFetchNote({
        kind: 'ok',
        text: `Found ${ids.length} model${ids.length > 1 ? 's' : ''} — pick the ones you want`,
      })
    } catch (err) {
      setFetchNote({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not reach the endpoint',
      })
    } finally {
      setFetchingModels(false)
    }
  }, [custom.baseUrl, custom.extraHeaders, apiKey, configuredIds])

  const currentProvider = providers.find((p) => p.id === selectedProvider)
  const isCustom = selectedProvider === 'custom'

  /**
   * The configuration form only exists while a provider is actually being
   * added or edited. With nothing selected the dialog shows the provider list
   * and nothing else - no dangling API key box.
   */
  const showForm = isAdding || editingId !== null || entries.length === 0

  // ===== Discovered-model selection =====

  const isAlreadyConfigured = (id: string) => configuredIds.has(id)

  const toggleDiscovered = useCallback((id: string) => {
    setDiscovered((prev) =>
      prev.map((model) =>
        model.id === id && !configuredIds.has(id)
          ? { ...model, selected: !model.selected }
          : model
      )
    )
  }, [configuredIds])

  const setAllDiscovered = useCallback(
    (selected: boolean) => {
      setDiscovered((prev) =>
        prev.map((model) => (configuredIds.has(model.id) ? model : { ...model, selected }))
      )
    },
    [configuredIds]
  )

  /** Apply the checklist: `custom.models` becomes exactly what is ticked. */
  const applyDiscovered = useCallback(() => {
    const configured = new Map(custom.models.map((model) => [model.id, model]))

    setCustom((prev) => ({
      ...prev,
      models: discovered
        .filter((model) => model.selected)
        .map((model) =>
          configured.get(model.id) ?? { id: model.id, name: model.id, imageToImage: true }
        ),
    }))

    setFetchNote({
      kind: 'ok',
      text: `Added ${discovered.filter((m) => m.selected).length} model(s)`,
    })
  }, [discovered, custom.models])

  const discoveredSelectedCount = discovered.filter((model) => model.selected).length

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--brand-strong) 0%, var(--brand) 100%)' }}
            >
              <Key className="w-5 h-5" style={{ color: 'var(--brand-foreground)' }} />
            </div>
            <div>
              <DialogTitle>API Provider Setup</DialogTitle>
              <DialogDescription style={{ color: 'var(--text-tertiary)' }}>
                Choose your image generation provider
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* A real <form> so the key input is not a password field outside a
            form (Chrome console warning) and Enter submits. */}
        <form
          className="flex-1 overflow-y-auto py-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!loading) handleSave()
          }}
        >
          {/* Error Message */}
          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
              style={{
                background: 'color-mix(in srgb, var(--error) 10%, transparent)',
                color: 'var(--error)',
                border: '1px solid color-mix(in srgb, var(--error) 25%, transparent)',
              }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ===== Configured providers ===== */}
          {entries.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Configured providers
                </label>
                <button
                  type="button"
                  onClick={startNewEntry}
                  className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                  style={{
                    color: 'var(--brand-foreground)',
                    background: 'var(--brand)',
                  }}
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>

              {isAdding && (
                <p
                  className="text-[11px] mb-2 flex items-center justify-between gap-2"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <span>Adding a new provider — pick a type below.</span>
                  <button
                    type="button"
                    onClick={cancelAdding}
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                </p>
              )}

              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                {entries.map((entry) => {
                  const isEditing = entry.id === editingId

                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                      style={{
                        background: isEditing ? 'var(--brand-soft-bg)' : 'var(--bg-base)',
                        border: isEditing
                          ? '1px solid var(--brand)'
                          : '1px solid var(--border-default)',
                      }}
                    >
                      <button
                        type="button"
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                        style={{ cursor: 'default' }}
                      >
                        {entry.provider === 'custom' ? (
                          <Server className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                        ) : null}
                        <span
                          className="text-xs font-medium truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {entryLabel(
                            entry,
                            providers.find((p) => p.id === entry.provider)?.name
                          )}
                        </span>
                        {entry.provider === 'custom' && entry.custom?.baseUrl && (
                          <span
                            className="text-[10px] font-mono truncate hidden sm:inline"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {entry.custom.baseUrl}
                          </span>
                        )}
                        {isEditing && (
                          <span
                            className="text-[9px] uppercase tracking-widest shrink-0"
                            style={{ color: 'var(--brand)' }}
                          >
                            editing
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditEntry(entry)}
                        aria-label={`Edit ${entryLabel(entry)}`}
                        className="p-1 rounded shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(entry.id)}
                        aria-label={`Remove ${entryLabel(entry)}`}
                        className="p-1 rounded shrink-0"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>

              {persistNote && (
                <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  {persistNote}
                </p>
              )}
            </div>
          )}

          {/* Nothing selected: explain what to do instead of showing a half-dead form. */}
          {!showForm && (
            <div
              className="mb-6 p-6 rounded-lg text-center text-sm"
              style={{
                color: 'var(--text-tertiary)',
                border: '1px dashed var(--border-default)',
              }}
            >
              Select the edit button next to a provider to change its settings,
              or add a new one.
            </div>
          )}

          {/* Editing an existing provider: a clear header and a way out. */}
          {editingId !== null && (
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Editing{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {entryLabel(
                    entries.find((e) => e.id === editingId)!,
                    providers.find((p) => p.id === selectedProvider)?.name
                  )}
                </strong>
              </span>
              <button
                type="button"
                onClick={stopEditing}
                className="text-[11px] px-2 py-1 rounded"
                style={{
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                }}
              >
                Done
              </button>
            </div>
          )}

          {/* Type picker - only shown while adding a new entry, so editing an
              existing provider is never interrupted by a redundant choice. */}
          {(isAdding || entries.length === 0) && (
            <div className="mb-6">
              {entries.length === 0 && (
                <label className="text-sm mb-3 block" style={{ color: 'var(--text-secondary)' }}>
                  Select Provider
                </label>
              )}
              <div className="grid gap-2 max-h-56 overflow-y-auto pr-2">
                {providers.map((provider: ProviderConfig) => (
                  <button
                    type="button"
                    key={provider.id}
                    onClick={() => {
                      // Switching type starts a fresh draft - never carry the
                      // previous provider's values into the new one.
                      if (provider.id !== selectedProvider) {
                        setApiKey('')
                        setCustom(DEFAULT_CUSTOM_SETTINGS)
                        setEditingId(null)
                      }
                      setSelectedProvider(provider.id)
                      setError(null)
                      setFetchNote(null)
                      setDiscovered([])
                    }}
                    className="w-full p-3 rounded-lg text-left transition-all focus:outline-none"
                    style={{
                      background: selectedProvider === provider.id ? 'var(--bg-elevated)' : 'var(--bg-base)',
                      border: selectedProvider === provider.id
                        ? '2px solid var(--brand)'
                        : '1px solid var(--border-default)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {provider.id === 'custom' && (
                      <Server className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    )}
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {provider.name}
                    </span>
                    {selectedProvider === provider.id && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--brand)' }}
                      >
                        <Check className="w-3 h-3" style={{ color: 'var(--brand-foreground)' }} />
                      </div>
                    )}
                    {provider.supportsModelListing && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--bg-base)', color: 'var(--success)' }}
                      >
                        Live Models
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    {provider.description}
                  </p>
                </button>
              ))}
              </div>
            </div>
          )}

          {/* ===== Custom OpenAI-compatible provider configuration ===== */}
          {showForm && isCustom && (
            <div className="mb-6 space-y-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Custom endpoint
                </label>
              </div>

              {/* Base URL */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                  Base URL
                </label>
                <input
                  type="text"
                  value={custom.baseUrl}
                  onChange={(e) => updateCustom({ baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full h-10 px-3 rounded-lg font-mono text-sm"
                  style={inputStyle}
                  autoComplete="off"
                  spellCheck="false"
                />
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  Include the version segment. Requests go to
                  {' '}<code style={{ color: 'var(--brand)' }}>/images/generations</code>, or
                  {' '}<code style={{ color: 'var(--brand)' }}>/chat/completions</code> in chat mode.
                </p>
              </div>

              {/* Display name */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                  Display name <span style={{ opacity: 0.6 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={custom.displayName ?? ''}
                  onChange={(e) => updateCustom({ displayName: e.target.value })}
                  placeholder="My Image API"
                  className="w-full h-10 px-3 rounded-lg text-sm"
                  style={inputStyle}
                  autoComplete="off"
                />
              </div>

              {/* API mode */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                  API format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'images' as CustomApiMode, label: 'Images API', hint: '/images/generations' },
                    { value: 'chat' as CustomApiMode, label: 'Chat API', hint: '/chat/completions' },
                    { value: 'dashscope' as CustomApiMode, label: 'DashScope (阿里云)', hint: 'multimodal-generation' },
                    { value: 'modelscope' as CustomApiMode, label: 'ModelScope (魔搭)', hint: '/v1/images + /tasks' },
                  ]).map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => updateCustom({ apiMode: option.value })}
                      className="px-3 py-2 rounded-lg text-left transition-all"
                      style={{
                        background: custom.apiMode === option.value ? 'var(--bg-elevated)' : 'var(--bg-base)',
                        border:
                          custom.apiMode === option.value
                            ? '2px solid var(--brand)'
                            : '1px solid var(--border-default)',
                      }}
                    >
                      <span
                        className="block text-xs font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {option.label}
                      </span>
                      <span className="block text-[10px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>

                {custom.apiMode === 'dashscope' && (
                  <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
                    Base URL 应为{' '}
                    <code style={{ color: 'var(--brand)' }}>https://dashscope.aliyuncs.com/api/v1</code>
                    。国内站的 <code style={{ color: 'var(--brand)' }}>/compatible-mode/v1</code>{' '}
                    只有 chat 和 embeddings，选 Images API 会返回 404。尺寸会自动转成{' '}
                    <code style={{ color: 'var(--brand)' }}>W*H</code>。
                  </p>
                )}

                {custom.apiMode === 'modelscope' && (
                  <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
                    Base URL 应为{' '}
                    <code style={{ color: 'var(--brand)' }}>https://api-inference.modelscope.cn/v1</code>
                    。该模式会自动带上轮询所需的请求头，并需要选择
                    <strong style={{ color: 'var(--text-secondary)' }}> Via app server</strong>{' '}
                    —— 浏览器无法发送那些头。
                  </p>
                )}
              </div>

              {/* Request transport */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                  Send requests
                </label>
                <div className="flex gap-2">
                  {([
                    {
                      value: 'direct' as CustomTransport,
                      label: 'Direct (browser)',
                      hint: 'Key stays in browser · needs CORS',
                    },
                    {
                      value: 'server' as CustomTransport,
                      label: 'Via app server',
                      hint: 'Bypasses CORS · key transits server',
                    },
                  ]).map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => updateCustom({ transport: option.value })}
                      className="flex-1 px-3 py-2 rounded-lg text-left transition-all"
                      style={{
                        background:
                          (custom.transport ?? 'direct') === option.value
                            ? 'var(--bg-elevated)'
                            : 'var(--bg-base)',
                        border:
                          (custom.transport ?? 'direct') === option.value
                            ? '2px solid var(--brand)'
                            : '1px solid var(--border-default)',
                      }}
                    >
                      <span
                        className="block text-xs font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {option.label}
                      </span>
                      <span className="block text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  If a direct request fails with &ldquo;failed at the network
                  level&rdquo;, the endpoint is not answering the CORS preflight —
                  switch to{' '}
                  <strong style={{ color: 'var(--text-secondary)' }}>Via app server</strong>.
                </p>
              </div>

              {/* Size override */}
              {custom.apiMode === 'images' && (
                <div>
                  <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                    Image size
                  </label>
                  <input
                    type="text"
                    value={custom.size ?? 'auto'}
                    onChange={(e) => updateCustom({ size: e.target.value })}
                    placeholder="auto"
                    className="w-full h-10 px-3 rounded-lg font-mono text-sm"
                    style={inputStyle}
                    autoComplete="off"
                  />
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    <Wand2 className="w-3 h-3 inline mr-1 -mt-0.5" />
                    <code style={{ color: 'var(--brand)' }}>auto</code> derives a size from the
                    selected aspect ratio. Providers disagree on the syntax: OpenAI,
                    ModelScope and most gateways want{' '}
                    <code style={{ color: 'var(--brand)' }}>1024x1024</code>, while Alibaba
                    DashScope wants <code style={{ color: 'var(--brand)' }}>1024*1024</code>.
                    If you get &ldquo;size format should be WxH&rdquo;, use{' '}
                    <code style={{ color: 'var(--brand)' }}>x</code>.
                  </p>
                </div>
              )}

              {/* Async task polling */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                  Task timeout (seconds)
                </label>
                <input
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  value={Math.round((custom.pollTimeoutMs ?? 55000) / 1000)}
                  onChange={(e) => {
                    const seconds = Number(e.target.value)

                    if (!Number.isFinite(seconds) || seconds <= 0) {
                      updateCustom({ pollTimeoutMs: undefined })
                      return
                    }

                    updateCustom({ pollTimeoutMs: Math.min(600, seconds) * 1000 })
                  }}
                  className="w-full h-10 px-3 rounded-lg text-sm"
                  style={inputStyle}
                />
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  Some endpoints reply with a task ID instead of an image (ModelScope
                  does). When that happens the request is polled until the task
                  finishes. Leave this alone unless slow models time out.
                </p>
              </div>

              {/* Task polling headers */}
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                  Task headers
                </label>
                <textarea
                  rows={2}
                  value={Object.entries(custom.taskHeaders ?? {})
                    .map(([name, value]) => `${name}: ${value}`)
                    .join('\n')}
                  onChange={(e) =>
                    updateCustom({ taskHeaders: parseHeaderLines(e.target.value) })
                  }
                  placeholder={'X-ModelScope-Task-Type: image_generation'}
                  className="w-full px-3 py-2 rounded-lg font-mono text-xs resize-none"
                  style={inputStyle}
                  spellCheck={false}
                />
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  One <code style={{ color: 'var(--brand)' }}>Name: value</code> per line,
                  sent only while polling a task. Requirements of known endpoints are
                  applied automatically — usually leave this blank.
                </p>
                <p
                  className="text-[11px] mt-1.5"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Note: a browser cannot send custom headers to endpoints that omit
                  them from their CORS policy. If this provider returns task IDs,
                  use <strong style={{ color: 'var(--text-secondary)' }}>Via app server</strong>.
                </p>
              </div>

              {/* Reference-image transport - only meaningful for the OpenAI images route */}
              {custom.apiMode === 'images' && (
                <div>
                  <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                    Image-to-image
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      {
                        value: 'inline' as const,
                        label: 'Inline image field',
                        hint: '/images/generations',
                      },
                      {
                        value: 'multipart' as const,
                        label: 'Multipart upload',
                        hint: '/images/edits',
                      },
                    ]).map((option) => {
                      const active = (custom.editStyle ?? 'inline') === option.value

                      return (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => updateCustom({ editStyle: option.value })}
                          className="px-3 py-2 rounded-lg text-left transition-all"
                          style={{
                            background: active ? 'var(--bg-elevated)' : 'var(--bg-base)',
                            border: active ? '2px solid var(--brand)' : '1px solid var(--border-default)',
                          }}
                        >
                          <span className="block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                            {option.label}
                          </span>
                          <span className="block text-[10px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                            {option.hint}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    Leave the default unless the endpoint answers 404 on
                    {' '}
                    <code style={{ color: 'var(--brand)' }}>/images/edits</code>. Alibaba Cloud
                    workspaces, ModelScope and other OpenAI-compatible gateways have no
                    edits route — they take the reference image as a field on the
                    generations call instead.
                  </p>
                </div>
              )}

              {/* Models */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Models
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={fetchModels}
                      disabled={fetchingModels}
                      className="text-[11px] px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                      style={{
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                      }}
                      title="Call GET {baseUrl}/models on your endpoint"
                    >
                      {fetchingModels ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Fetch
                    </button>
                    <button
                      type="button"
                      onClick={addModel}
                      className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                      style={{
                        color: 'var(--brand-foreground)',
                        background: 'var(--brand)',
                      }}
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </div>

                {fetchNote && (
                  <p
                    className="text-[11px] mb-2"
                    style={{
                      color: fetchNote.kind === 'ok' ? 'var(--success)' : 'var(--error)',
                    }}
                  >
                    {fetchNote.text}
                  </p>
                )}

                {/* Discovered models awaiting a decision */}
                {discovered.length > 0 && (
                  <div
                    className="mb-3 rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--border-default)' }}
                  >
                    <div
                      className="flex items-center justify-between px-2.5 py-2"
                      style={{
                        background: 'var(--bg-elevated)',
                        borderBottom: '1px solid var(--border-default)',
                      }}
                    >
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {discoveredSelectedCount} / {discovered.length} selected
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setAllDiscovered(true)}
                          className="text-[10px] px-2 py-0.5 rounded"
                          style={{
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-default)',
                          }}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllDiscovered(false)}
                          className="text-[10px] px-2 py-0.5 rounded"
                          style={{
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-default)',
                          }}
                        >
                          None
                        </button>
                      </div>
                    </div>

                    <div className="max-h-44 overflow-y-auto">
                      {discovered.map((model) => {
                        const configured = isAlreadyConfigured(model.id)

                        return (
                          <label
                            key={model.id}
                            className="flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer"
                            style={{
                              background:
                                model.selected && !configured
                                  ? 'var(--brand-soft-bg)'
                                  : 'transparent',
                            }}
                            onClick={() => !configured && toggleDiscovered(model.id)}
                          >
                            <input
                              type="checkbox"
                              checked={model.selected}
                              disabled={configured}
                              onChange={() => toggleDiscovered(model.id)}
                              className="accent-[var(--brand)] w-3.5 h-3.5 shrink-0"
                            />
                            <span
                              className="font-mono text-[11px] truncate flex-1"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {model.id}
                            </span>
                            {configured && (
                              <span
                                className="text-[9px] uppercase tracking-widest shrink-0"
                                style={{ color: 'var(--text-tertiary)' }}
                              >
                                in list
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>

                    <div
                      className="px-2.5 py-2"
                      style={{ borderTop: '1px solid var(--border-default)' }}
                    >
                      <button
                        type="button"
                        onClick={applyDiscovered}
                        className="w-full text-[11px] py-1.5 rounded font-medium flex items-center justify-center gap-1.5"
                        style={{
                          background: 'var(--brand)',
                          color: 'var(--brand-foreground)',
                        }}
                      >
                        <Check className="w-3 h-3" />
                        Apply selection ({discoveredSelectedCount})
                      </button>
                    </div>
                  </div>
                )}

                {custom.models.length === 0 ? (
                  <p
                    className="text-[11px] p-3 rounded-lg text-center"
                    style={{
                      color: 'var(--text-tertiary)',
                      border: '1px dashed var(--border-default)',
                    }}
                  >
                    No models yet — add one manually or use Fetch.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {custom.models.map((model, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={model.id}
                          onChange={(e) => updateModel(index, { id: e.target.value })}
                          placeholder="model-id"
                          className="flex-1 h-9 px-2.5 rounded-lg font-mono text-xs"
                          style={inputStyle}
                          autoComplete="off"
                          spellCheck="false"
                        />
                        <input
                          type="text"
                          value={model.name ?? ''}
                          onChange={(e) => updateModel(index, { name: e.target.value })}
                          placeholder="Label"
                          className="w-28 h-9 px-2.5 rounded-lg text-xs"
                          style={inputStyle}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => updateModel(index, { imageToImage: !model.imageToImage })}
                          title={
                            model.imageToImage !== false
                              ? 'Supports reference images — click to disable'
                              : 'Text-to-image only — click to allow references'
                          }
                          className="text-[9px] font-bold px-1.5 py-1 rounded shrink-0 uppercase tracking-widest"
                          style={{
                            background: model.imageToImage !== false ? 'var(--brand-soft-bg)' : 'var(--bg-elevated)',
                            color: model.imageToImage !== false ? 'var(--brand)' : 'var(--text-tertiary)',
                            border: '1px solid var(--border-default)',
                          }}
                        >
                          i2i
                        </button>
                        <button
                          type="button"
                          onClick={() => removeModel(index)}
                          aria-label="Remove model"
                          className="p-1.5 rounded shrink-0"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* API Key Input */}
          {showForm && (
            <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                API Key
                {isCustom && (
                  <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
                    (optional for local endpoints)
                  </span>
                )}
              </label>
              {currentProvider && !isCustom && (
                <a
                  href={currentProvider.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs flex items-center gap-1 hover:opacity-80"
                  style={{ color: 'var(--brand)' }}
                >
                  {currentProvider.helpText}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={currentProvider?.apiKeyPlaceholder || 'Enter your API key'}
                disabled={loading}
                className="w-full h-10 px-3 pr-10 rounded-lg font-mono text-sm"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--ring)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                autoComplete="off"
                spellCheck="false"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:opacity-80"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          )}

          {/* Save Button - only meaningful while adding or editing. */}
          {showForm && (
            <button
              type="submit"
              disabled={loading || (!isCustom && !apiKey.trim())}
              className="w-full h-11 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, var(--brand-strong) 0%, var(--brand) 100%)',
                color: 'var(--brand-foreground)',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
          )}
        </form>

        {/* Footer */}
        <div
          className="pt-4 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Video Coming Soon - subtle hint */}
          <p className="text-xs text-center flex items-center justify-center gap-1.5" style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>
            <Video className="w-3 h-3" />
            Video generation coming soon
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}