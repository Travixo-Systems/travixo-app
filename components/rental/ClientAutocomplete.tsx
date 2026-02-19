'use client'

import { useState, useEffect, useRef } from 'react'

interface ClientAutocompleteProps {
  value: string
  onChange: (value: string) => void
  organizationId: string
  placeholder?: string
  className?: string
}

export default function ClientAutocomplete({
  value,
  onChange,
  organizationId,
  placeholder = '',
  className = '',
}: ClientAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchSuggestions(searchTerm: string) {
    if (searchTerm.length < 2) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `/api/rentals/clients?q=${encodeURIComponent(searchTerm)}&org_id=${organizationId}`
      )
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.clients || [])
        setShowSuggestions(true)
      }
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value
    onChange(newValue)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue)
    }, 300)
  }

  function handleSelect(client: string) {
    onChange(client)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
        placeholder={placeholder}
        className={className}
        style={{ fontSize: '16px' }}
        maxLength={255}
        autoComplete="off"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((client, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(client)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium text-[#00252b] border-b border-gray-100 last:border-0 transition-colors"
            >
              {client}
            </button>
          ))}
        </div>
      )}
      {loading && value.length >= 2 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#E30613]" />
        </div>
      )}
    </div>
  )
}
