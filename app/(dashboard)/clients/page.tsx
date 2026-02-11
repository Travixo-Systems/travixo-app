'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, Users, Package, AlertTriangle, Edit3, X, Loader2 } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import FeatureGate from '@/components/subscription/FeatureGate'

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  notes: string | null
  created_at: string
}

interface ClientWithRentals extends Client {
  active_rental_count: number
}

export default function ClientsPage() {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const [clients, setClients] = useState<ClientWithRentals[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formCompany, setFormCompany] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function fetchClients() {
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      params.set('limit', '100')
      const res = await fetch(`/api/clients?${params}`)
      if (res.ok) {
        const data = await res.json()
        // For each client, we'll show them but we don't have rental count from API yet
        // The clients list response has basic info
        setClients((data.clients || []).map((c: Client) => ({
          ...c,
          active_rental_count: 0, // Will be computed later if needed
        })))
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClients()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  function resetForm() {
    setFormName('')
    setFormEmail('')
    setFormPhone('')
    setFormCompany('')
    setFormNotes('')
    setFormError('')
    setFormSubmitting(false)
  }

  function openAdd() {
    resetForm()
    setEditingClient(null)
    setShowAddForm(true)
  }

  function openEdit(client: Client) {
    setFormName(client.name)
    setFormEmail(client.email || '')
    setFormPhone(client.phone || '')
    setFormCompany(client.company || '')
    setFormNotes(client.notes || '')
    setFormError('')
    setEditingClient(client)
    setShowAddForm(true)
  }

  function closeForm() {
    setShowAddForm(false)
    setEditingClient(null)
    resetForm()
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      setFormError(language === 'fr' ? 'Le nom est requis' : 'Name is required')
      return
    }

    setFormSubmitting(true)
    setFormError('')

    try {
      const body = {
        name: formName.trim(),
        email: formEmail.trim() || null,
        phone: formPhone.trim() || null,
        company: formCompany.trim() || null,
        notes: formNotes.trim() || null,
      }

      const url = editingClient ? `/api/clients/${editingClient.id}` : '/api/clients'
      const method = editingClient ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.error === 'client_exists') {
          setFormError(t('clients.clientExists'))
        } else {
          setFormError(data.error || 'Failed')
        }
        return
      }

      closeForm()
      fetchClients()
    } catch {
      setFormError(language === 'fr' ? 'Erreur de connexion' : 'Connection error')
    } finally {
      setFormSubmitting(false)
    }
  }

  return (
    <FeatureGate feature="rental_management">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#00252b]">
              {t('clients.pageTitle')}
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              {t('clients.pageSubtitle')}
            </p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#f26f00] text-white rounded-lg font-bold hover:bg-[#d96200] transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            {t('clients.addClient')}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('clients.searchClients')}
            className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Empty state */}
        {!loading && clients.length === 0 && (
          <div className="text-center py-16">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-[#00252b] mb-2">
              {t('clients.noClients')}
            </h3>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
              {t('clients.noClientsDescription')}
            </p>
          </div>
        )}

        {/* Client cards */}
        {!loading && clients.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <div
                key={client.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#00252b] text-base truncate">
                      {client.name}
                    </h3>
                    {client.company && (
                      <p className="text-gray-500 text-xs mt-0.5 truncate">{client.company}</p>
                    )}
                  </div>
                  <button
                    onClick={() => openEdit(client)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors ml-2"
                  >
                    <Edit3 className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                <div className="space-y-1.5 mb-3">
                  {client.email && (
                    <p className="text-xs text-gray-600 truncate">{client.email}</p>
                  )}
                  {client.phone && (
                    <p className="text-xs text-gray-600">{client.phone}</p>
                  )}
                </div>

                {client.notes && (
                  <p className="text-xs text-gray-400 line-clamp-2 mb-3">{client.notes}</p>
                )}

                <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500">
                      {new Date(client.created_at).toLocaleDateString(
                        language === 'fr' ? 'fr-FR' : 'en-US',
                        { day: 'numeric', month: 'short', year: 'numeric' }
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={closeForm} />
            <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl mx-4">
              <div className="px-6 pt-6 pb-2">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-[#00252b]">
                    {editingClient ? t('clients.editClient') : t('clients.addClient')}
                  </h2>
                  <button
                    onClick={closeForm}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleFormSubmit} className="px-6 pb-6 space-y-4">
                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-sm font-medium">{formError}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-[#00252b] mb-1.5">
                    {t('clients.name')} *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={language === 'fr' ? 'ex: Bouygues Construction' : 'e.g., Bouygues Construction'}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                    style={{ fontSize: '16px' }}
                    maxLength={255}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#00252b] mb-1.5">
                    {t('clients.email')}
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                    style={{ fontSize: '16px' }}
                    maxLength={255}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-[#00252b] mb-1.5">
                      {t('clients.phone')}
                    </label>
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="+33 6..."
                      className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                      style={{ fontSize: '16px' }}
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#00252b] mb-1.5">
                      {t('clients.company')}
                    </label>
                    <input
                      type="text"
                      value={formCompany}
                      onChange={(e) => setFormCompany(e.target.value)}
                      placeholder={language === 'fr' ? 'Entreprise' : 'Company'}
                      className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                      style={{ fontSize: '16px' }}
                      maxLength={255}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#00252b] mb-1.5">
                    {t('clients.notes')}
                  </label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder={language === 'fr' ? 'Notes...' : 'Notes...'}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                    style={{ fontSize: '16px' }}
                    rows={2}
                    maxLength={500}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={formSubmitting || !formName.trim()}
                    className="flex-1 py-2.5 bg-[#f26f00] text-white rounded-lg font-bold hover:bg-[#d96200] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {formSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    {editingClient
                      ? (language === 'fr' ? 'Enregistrer' : 'Save')
                      : t('clients.addClient')
                    }
                  </button>
                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={formSubmitting}
                    className="px-6 py-2.5 bg-white text-[#00252b] border-2 border-[#00252b] rounded-lg font-bold hover:bg-[#00252b] hover:text-white transition-all disabled:opacity-50"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </FeatureGate>
  )
}
