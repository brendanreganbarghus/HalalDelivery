import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { MenuItem } from './App.tsx'
import {
  computeUnitPriceCents,
  defaultSelections,
  missingRequiredGroups,
  type SelectedOptions,
} from './modifiers.ts'
import { type Language } from './i18n.ts'

const text = {
  en: {
    required: 'Required',
    optional: 'Optional',
    choose1: 'Choose 1',
    chooseUpTo: (max: number) => `Choose up to ${max}`,
    quantity: 'Quantity',
    addToBasket: 'Add to basket',
    total: 'Total',
    close: 'Close',
    note: 'Special instructions',
    notePlaceholder: 'For example: no tomato, sauce on the side.',
    allergyWarning: 'For allergies, contact the restaurant. Notes do not replace allergen information.',
  },
  nl: {
    required: 'Verplicht',
    optional: 'Optioneel',
    choose1: 'Kies 1',
    chooseUpTo: (max: number) => `Kies tot ${max}`,
    quantity: 'Aantal',
    addToBasket: 'Toevoegen aan mandje',
    total: 'Totaal',
    close: 'Sluiten',
    note: 'Speciale instructies',
    notePlaceholder: 'Bijvoorbeeld: geen tomaat, saus apart.',
    allergyWarning: 'Neem bij allergieën contact op met het restaurant. Notities vervangen allergeneninformatie niet.',
  },
} satisfies Record<Language, {
  required: string
  optional: string
  choose1: string
  chooseUpTo: (max: number) => string
  quantity: string
  addToBasket: string
  total: string
  close: string
  note: string
  notePlaceholder: string
  allergyWarning: string
}>

const money = {
  en: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }),
  nl: new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }),
}

function formatMoney(language: Language, value: number) {
  return money[language].format(value)
}

/**
 * Polished dark-theme configuration dialog for a modifier-enabled menu item (pizza, burger,
 * meal, ...). Enforces required groups/min/max, shows a live price, and only allows adding to
 * the basket once every required choice has been made. Closes on Escape for keyboard users.
 */
export function ModifierModal({
  item,
  language,
  onClose,
  onAdd,
}: {
  item: MenuItem
  language: Language
  onClose: () => void
  onAdd: (selectedOptions: SelectedOptions, quantity: number, note: string) => void
}) {
  const t = text[language]
  const modifierConfig = item.modifier_config ?? []
  const [selectedOptions, setSelectedOptions] = useState<SelectedOptions>(() => defaultSelections(modifierConfig))
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const titleId = useId()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function setGroupSelection(groupId: string, optionIds: string[]) {
    setSelectedOptions((current) => {
      const next = current.filter((entry) => entry.group_id !== groupId)
      if (optionIds.length > 0) next.push({ group_id: groupId, option_ids: optionIds })
      return next
    })
  }

  function selectedIdsFor(groupId: string): string[] {
    return selectedOptions.find((entry) => entry.group_id === groupId)?.option_ids ?? []
  }

  const unitPriceCents = computeUnitPriceCents(item.price_cents, modifierConfig, selectedOptions)
  const canAdd = missingRequiredGroups(modifierConfig, selectedOptions).length === 0

  return (
    <div className="storefront-modal-layer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button className="storefront-modal-backdrop" type="button" onClick={onClose} aria-label={t.close} />
      <section className="storefront-modal modifier-modal">
        <header>
          <h2 id={titleId}>{item.name}</h2>
          <button type="button" onClick={onClose} aria-label={t.close}><X /></button>
        </header>
        {item.description && <p className="modifier-modal__description">{item.description}</p>}

        <div className="modifier-modal__groups">
          {modifierConfig.map((group) => {
            const chosen = selectedIdsFor(group.id)
            const groupLegendId = `${titleId}-${group.id}`
            return (
              <fieldset className="modifier-group" key={group.id} aria-labelledby={groupLegendId}>
                <legend id={groupLegendId}>
                  <span>{group.name}</span>
                  <small className={group.required ? 'modifier-group__required' : 'modifier-group__optional'}>
                    {group.required
                      ? (group.selection_type === 'single' ? t.choose1 : t.required)
                      : (group.max_select > 1 ? t.chooseUpTo(group.max_select) : t.optional)}
                  </small>
                </legend>
                <div className="modifier-group__options">
                  {group.options.map((option) => {
                    const inputId = `${groupLegendId}-${option.id}`
                    const isChecked = chosen.includes(option.id)
                    const isSingle = group.selection_type === 'single'
                    const atMax = !isSingle && chosen.length >= group.max_select && !isChecked
                    return (
                      <label className={`modifier-option${isChecked ? ' modifier-option--checked' : ''}`} htmlFor={inputId} key={option.id}>
                        <input
                          id={inputId}
                          type={isSingle ? 'radio' : 'checkbox'}
                          name={groupLegendId}
                          checked={isChecked}
                          disabled={atMax}
                          onChange={() => {
                            if (isSingle) {
                              setGroupSelection(group.id, [option.id])
                            } else if (isChecked) {
                              setGroupSelection(group.id, chosen.filter((id) => id !== option.id))
                            } else {
                              setGroupSelection(group.id, [...chosen, option.id])
                            }
                          }}
                        />
                        <span>{option.name}</span>
                        {option.price_delta_cents > 0 && (
                          <strong>+{formatMoney(language, option.price_delta_cents / 100)}</strong>
                        )}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>

        <label className="modifier-modal__note">
          <strong>{t.note}</strong>
          <textarea
            value={note}
            maxLength={300}
            rows={3}
            placeholder={t.notePlaceholder}
            onChange={(event) => setNote(event.target.value)}
          />
          <small>{t.allergyWarning}</small>
        </label>

        <footer className="modifier-modal__footer">
          <div className="modifier-modal__quantity" role="group" aria-label={t.quantity}>
            <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease quantity"><Minus /></button>
            <span>{quantity}</span>
            <button type="button" onClick={() => setQuantity((current) => Math.min(20, current + 1))} aria-label="Increase quantity"><Plus /></button>
          </div>
          <button
            className="modifier-modal__add"
            type="button"
            disabled={!canAdd}
            onClick={() => onAdd(selectedOptions, quantity, note.trim())}
          >
            <span>{t.addToBasket}</span>
            <strong>{formatMoney(language, (unitPriceCents * quantity) / 100)}</strong>
          </button>
        </footer>
      </section>
    </div>
  )
}
