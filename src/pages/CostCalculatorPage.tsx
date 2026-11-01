import { BookOpen, Calculator, ChartNoAxesCombined, CircleDollarSign } from 'lucide-react'

const plannedTools = [
  { icon: Calculator, title: 'Costo rápido' },
  { icon: BookOpen, title: 'Costo por receta' },
  { icon: CircleDollarSign, title: 'Precio sugerido' },
  { icon: ChartNoAxesCombined, title: 'Margen estimado' },
]

export function CostCalculatorPage() {
  return <div className="cost-calculator-page">
    <header className="page-heading">
      <div>
        <span className="eyebrow accent">PRODUCTIVIDAD</span>
        <h1>Calculadora de costo<span className="heading-dot">.</span></h1>
        <p className="muted">Calcula rápidamente cuánto cuesta producir un producto sin crear una cotización.</p>
      </div>
    </header>

    <section className="panel cost-calculator-intro" aria-labelledby="cost-calculator-intro-title">
      <span className="cost-calculator-icon" aria-hidden="true"><Calculator size={24} strokeWidth={1.8} /></span>
      <div>
        <span className="eyebrow accent">UNA HERRAMIENTA PARA ESTIMAR</span>
        <h2 id="cost-calculator-intro-title">Consulta tus costos con claridad</h2>
        <p>Úsala para estimaciones rápidas cuando un cliente pregunte por un precio.</p>
        <p className="cost-calculator-note">Los cálculos realizados aquí no crean una cotización ni un pedido automáticamente.</p>
      </div>
    </section>

    <section className="cost-calculator-roadmap" aria-labelledby="cost-calculator-roadmap-title">
      <div className="cost-calculator-roadmap-heading">
        <div><span className="eyebrow">SIGUIENTE ETAPA</span><h2 id="cost-calculator-roadmap-title">Un espacio que crecerá contigo</h2></div>
        <span className="subtle-badge">En preparación</span>
      </div>
      <p>La calculadora completa se habilitará en una próxima fase. Por ahora no se realizan cálculos desde esta pantalla.</p>
      <ul className="cost-calculator-tools">
        {plannedTools.map(({ icon: Icon, title }) => <li key={title}><span aria-hidden="true"><Icon size={18} /></span><strong>{title}</strong><small>Próximamente</small></li>)}
      </ul>
    </section>
  </div>
}
