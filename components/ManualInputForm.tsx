'use client'
import { useState } from 'react'
import type { DealInput, UnitMixRow } from '@/lib/types'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Plus, Trash2 } from 'lucide-react'

interface ManualInputFormProps {
  initialDeal?: Partial<DealInput>
  missing?: string[]
  onSubmit: (deal: DealInput) => void
  loading?: boolean
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  highlight,
}: {
  label: string
  name: string
  value: string | number | undefined
  onChange: (val: string) => void
  type?: string
  placeholder?: string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name} className={highlight ? 'text-destructive' : ''}>
        {label}{highlight && ' *'}
      </Label>
      <Input
        id={name}
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={highlight ? 'border-destructive' : ''}
      />
    </div>
  )
}

const EMPTY_UNIT: UnitMixRow = { bed_count: 1, bath_count: 1, unit_count: 0, avg_sf: 0, market_rent: 0, actual_rent: 0 }

export function ManualInputForm({ initialDeal = {}, missing = [], onSubmit, loading }: ManualInputFormProps) {
  const [property, setProperty] = useState({
    property_name: initialDeal.property_name ?? '',
    address: initialDeal.address ?? '',
    city: initialDeal.city ?? '',
    state: initialDeal.state ?? '',
    zip_code: initialDeal.zip_code ?? '',
    year_built: initialDeal.year_built ?? '',
    units: initialDeal.units ?? '',
    total_sf: initialDeal.total_sf ?? '',
    occupancy_pct: initialDeal.occupancy_pct ?? '',
    asking_price: initialDeal.asking_price ?? '',
    broker_cap_rate: initialDeal.broker_cap_rate ?? '',
    sale_type: initialDeal.sale_type ?? '',
  })

  const [income, setIncome] = useState({
    gross_rental_income: initialDeal.gross_rental_income ?? '',
    utility_reimbursement: initialDeal.utility_reimbursement ?? '',
    other_income: initialDeal.other_income ?? '',
    pf_gross_rental: initialDeal.pf_gross_rental ?? '',
    pf_other_income: initialDeal.pf_other_income ?? '',
    pf_utility_reimb: initialDeal.pf_utility_reimb ?? '',
  })

  const [expenses, setExpenses] = useState({
    property_taxes: initialDeal.property_taxes ?? '',
    insurance: initialDeal.insurance ?? '',
    management_fee: initialDeal.management_fee ?? '',
    utilities: initialDeal.utilities ?? '',
    reserves: initialDeal.reserves ?? '',
  })

  const [unitMix, setUnitMix] = useState<UnitMixRow[]>(initialDeal.unit_mix ?? [EMPTY_UNIT])
  const [notes, setNotes] = useState(initialDeal.notes ?? '')

  function num(v: string | number | undefined): number | undefined {
    const n = Number(v)
    return isNaN(n) || v === '' ? undefined : n
  }

  function handleSubmit() {
    const deal: DealInput = {
      property_name: property.property_name || undefined,
      address: property.address || undefined,
      city: property.city || undefined,
      state: property.state || undefined,
      zip_code: property.zip_code || undefined,
      year_built: num(property.year_built),
      units: num(property.units),
      total_sf: num(property.total_sf),
      occupancy_pct: num(property.occupancy_pct),
      asking_price: num(property.asking_price),
      broker_cap_rate: num(property.broker_cap_rate),
      sale_type: property.sale_type || undefined,
      gross_rental_income: num(income.gross_rental_income),
      utility_reimbursement: num(income.utility_reimbursement),
      other_income: num(income.other_income),
      pf_gross_rental: num(income.pf_gross_rental),
      pf_other_income: num(income.pf_other_income),
      pf_utility_reimb: num(income.pf_utility_reimb),
      property_taxes: num(expenses.property_taxes),
      insurance: num(expenses.insurance),
      management_fee: num(expenses.management_fee),
      utilities: num(expenses.utilities),
      reserves: num(expenses.reserves),
      unit_mix: unitMix.filter((u) => u.unit_count > 0),
      notes: notes || undefined,
    }
    onSubmit(deal)
  }

  const isHighlighted = (f: string) => missing.includes(f)

  return (
    <div className="space-y-6" data-testid="manual-input-form">
      {missing.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Critical fields missing. Please complete:{' '}
          {missing.map((m) => m.replace(/_/g, ' ')).join(', ')}
        </div>
      )}

      {/* Property */}
      <section>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Property</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Name" name="property_name" value={property.property_name} onChange={(v) => setProperty((p) => ({ ...p, property_name: v }))} />
          <Field label="Address" name="address" value={property.address} onChange={(v) => setProperty((p) => ({ ...p, address: v }))} highlight={isHighlighted('address')} />
          <Field label="City" name="city" value={property.city} onChange={(v) => setProperty((p) => ({ ...p, city: v }))} />
          <Field label="State (2-letter)" name="state" value={property.state} onChange={(v) => setProperty((p) => ({ ...p, state: v }))} />
          <Field label="ZIP" name="zip_code" value={property.zip_code} onChange={(v) => setProperty((p) => ({ ...p, zip_code: v }))} />
          <Field label="Year Built" name="year_built" type="number" value={property.year_built} onChange={(v) => setProperty((p) => ({ ...p, year_built: v }))} />
          <Field label="Units" name="units" type="number" value={property.units} onChange={(v) => setProperty((p) => ({ ...p, units: v }))} highlight={isHighlighted('units')} />
          <Field label="Total SF" name="total_sf" type="number" value={property.total_sf} onChange={(v) => setProperty((p) => ({ ...p, total_sf: v }))} />
          <Field label="Occupancy (0–1)" name="occupancy_pct" type="number" value={property.occupancy_pct} onChange={(v) => setProperty((p) => ({ ...p, occupancy_pct: v }))} />
          <Field label="Asking Price" name="asking_price" type="number" value={property.asking_price} onChange={(v) => setProperty((p) => ({ ...p, asking_price: v }))} highlight={isHighlighted('asking_price')} />
          <Field label="Broker Cap (0–1)" name="broker_cap_rate" type="number" value={property.broker_cap_rate} onChange={(v) => setProperty((p) => ({ ...p, broker_cap_rate: v }))} />
          <Field label="Sale Type" name="sale_type" value={property.sale_type} onChange={(v) => setProperty((p) => ({ ...p, sale_type: v }))} />
        </div>
      </section>

      {/* Income (T-12) */}
      <section>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Income (T-12)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Gross Rental (net of vacancy)" name="gross_rental_income" type="number" value={income.gross_rental_income} onChange={(v) => setIncome((p) => ({ ...p, gross_rental_income: v }))} highlight={isHighlighted('gross_rental_income')} />
          <Field label="Utility Reimbursement" name="utility_reimbursement" type="number" value={income.utility_reimbursement} onChange={(v) => setIncome((p) => ({ ...p, utility_reimbursement: v }))} />
          <Field label="Other Income" name="other_income" type="number" value={income.other_income} onChange={(v) => setIncome((p) => ({ ...p, other_income: v }))} />
          <Field label="PF Gross Rental" name="pf_gross_rental" type="number" value={income.pf_gross_rental} onChange={(v) => setIncome((p) => ({ ...p, pf_gross_rental: v }))} />
          <Field label="PF Other Income" name="pf_other_income" type="number" value={income.pf_other_income} onChange={(v) => setIncome((p) => ({ ...p, pf_other_income: v }))} />
          <Field label="PF Utility Reimbursement" name="pf_utility_reimb" type="number" value={income.pf_utility_reimb} onChange={(v) => setIncome((p) => ({ ...p, pf_utility_reimb: v }))} />
        </div>
      </section>

      {/* Expenses (T-12) */}
      <section>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Expenses (T-12)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Property Taxes" name="property_taxes" type="number" value={expenses.property_taxes} onChange={(v) => setExpenses((p) => ({ ...p, property_taxes: v }))} />
          <Field label="Insurance" name="insurance" type="number" value={expenses.insurance} onChange={(v) => setExpenses((p) => ({ ...p, insurance: v }))} />
          <Field label="Management Fee" name="management_fee" type="number" value={expenses.management_fee} onChange={(v) => setExpenses((p) => ({ ...p, management_fee: v }))} />
          <Field label="Utilities" name="utilities" type="number" value={expenses.utilities} onChange={(v) => setExpenses((p) => ({ ...p, utilities: v }))} />
          <Field label="Reserves" name="reserves" type="number" value={expenses.reserves} onChange={(v) => setExpenses((p) => ({ ...p, reserves: v }))} />
        </div>
      </section>

      {/* Unit Mix */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Unit Mix</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setUnitMix((m) => [...m, { ...EMPTY_UNIT }])}
            data-testid="button-add-unit"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Unit Type
          </Button>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground font-medium">
            {['bed_count', 'bath_count', 'unit_count', 'avg_sf', 'market_rent', 'actual_rent'].map((h) => (
              <span key={h} className="capitalize">{h.replace(/_/g, ' ')}</span>
            ))}
          </div>
          {unitMix.map((u, i) => (
            <div key={i} className="grid grid-cols-6 gap-2 items-center">
              {(['bed_count', 'bath_count', 'unit_count', 'avg_sf', 'market_rent', 'actual_rent'] as const).map((field) => (
                <Input
                  key={field}
                  type="number"
                  value={u[field]}
                  onChange={(e) =>
                    setUnitMix((m) => m.map((row, j) => j === i ? { ...row, [field]: Number(e.target.value) } : row))
                  }
                  className="h-8 text-xs"
                />
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive col-span-1 -ml-1"
                onClick={() => setUnitMix((m) => m.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional context, concerns, or observations…"
          className="mt-1"
          rows={3}
        />
      </section>

      <Button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full"
        data-testid="button-manual-submit"
      >
        {loading ? 'Analyzing…' : 'Run Analysis'}
      </Button>
    </div>
  )
}
