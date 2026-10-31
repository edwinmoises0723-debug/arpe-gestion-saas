/** Presentation only: the quote's existing pending-price guard remains authoritative. */
export function QuoteItemPrice({ id, pending, value, onChange }: { id: string; pending: boolean; value: number; onChange: (value: number) => void }) {
  return <label htmlFor={id}>Precio unitario
    {pending && <span className="price-pending-badge">Precio pendiente</span>}
    <input id={id} type="number" min="0" step="0.01" required={!pending} value={pending ? '' : value} placeholder={pending ? 'Define el precio' : undefined} aria-describedby={pending ? `${id}-hint` : undefined} onChange={event => onChange(Number(event.target.value))} />
    {pending && <small id={`${id}-hint`} className="field-hint">Este producto se solicitó con precio por consultar. Define un precio mayor que cero antes de guardar.</small>}
  </label>
}
