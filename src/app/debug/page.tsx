import {
  PLANS,
  BUMPS,
  getPublicAssetUrl,
  formatPrice,
} from '@/lib/plans'

/**
 * /debug — user-friendly HTML page showing the status of every Stripe
 * env var with big colored badges (green / red / yellow).
 *
 * This is the same data as /api/debug/env but rendered as a readable HTML
 * page so the user can open it directly in the browser without parsing JSON.
 *
 * Use it to diagnose the "STRIPE_SECRET_KEY is not set" checkout error.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type VarStatus = 'set' | 'empty' | 'missing'
interface VarCheck {
  name: string
  value: string | undefined
  status: VarStatus
  required: boolean
  hint: string
}

function checkVar(
  name: string,
  value: string | undefined,
  required: boolean,
  hint: string
): VarCheck {
  let status: VarStatus
  if (value === undefined) status = 'missing'
  else if (value === '') status = 'empty'
  else status = 'set'
  return { name, value, status, required, hint }
}

function mask(value: string | undefined): string {
  if (!value) return ''
  if (value.length < 16) return '••••'
  return `${value.slice(0, 8)}…${value.slice(-4)}`
}

function Badge({ status }: { status: VarStatus }) {
  const styles: Record<VarStatus, { style: React.CSSProperties; emoji: string; label: string }> = {
    set: {
      style: {
        background: '#0e3d1c',
        color: '#5bd678',
        border: '1px solid #2e8a45',
        padding: '6px 14px',
        borderRadius: '999px',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        whiteSpace: 'nowrap' as const,
      },
      emoji: '✅',
      label: 'OK',
    },
    missing: {
      style: {
        background: '#3d0e0e',
        color: '#ff6b6b',
        border: '1px solid #8a2e2e',
        padding: '6px 14px',
        borderRadius: '999px',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        whiteSpace: 'nowrap' as const,
      },
      emoji: '❌',
      label: 'MANQUANTE',
    },
    empty: {
      style: {
        background: '#3d3d0e',
        color: '#ffd66b',
        border: '1px solid #8a8a2e',
        padding: '6px 14px',
        borderRadius: '999px',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        whiteSpace: 'nowrap' as const,
      },
      emoji: '⚠️',
      label: 'VIDE',
    },
  }
  const s = styles[status]
  return (
    <span style={s.style}>
      <span>{s.emoji}</span>
      <span>{s.label}</span>
    </span>
  )
}

export default function DebugPage() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  const vars: VarCheck[] = [
    checkVar(
      'STRIPE_SECRET_KEY',
      secretKey,
      true,
      'Clé secrète Stripe (sk_live_... ou sk_test_...). Indispensable pour que /api/checkout puisse créer une session de paiement.'
    ),
    checkVar(
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      publishableKey,
      true,
      'Clé publique Stripe (pk_live_... ou pk_test_...). Indispensable pour que la page /checkout puisse charger Stripe.js.'
    ),
    checkVar(
      'STRIPE_WEBHOOK_SECRET',
      webhookSecret,
      false,
      'Secret de signature du webhook (whsec_...). Optionnel tant que le webhook n\'est pas enregistré dans le Stripe Dashboard.'
    ),
    checkVar(
      'NEXT_PUBLIC_BASE_URL',
      baseUrl,
      true,
      'URL HTTPS publique de votre site déployé. Utilisée pour le return_url 3DS et les images des produits Stripe.'
    ),
  ]

  const requiredOk = vars.filter((v) => v.required).every((v) => v.status === 'set')
  const isVercel = Boolean(process.env.VERCEL)
  const vercelEnv = process.env.VERCEL_ENV ?? '(not on Vercel)'
  const vercelUrl = process.env.VERCEL_URL ?? '(none)'
  const gitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '(none)').slice(0, 8)
  const nodeEnv = process.env.NODE_ENV ?? '(unset)'

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0a0b0d',
        color: '#f5f5f3',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
        padding: '32px 16px',
      }}
    >
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 800,
              margin: 0,
              marginBottom: '8px',
              color: '#ffae36',
            }}
          >
            🔍 Diagnostic Stripe — Le trésor du soudeur
          </h1>
          <p style={{ color: '#a6aab1', fontSize: '14px', margin: 0 }}>
            Page /debug — vérification des variables d&apos;environnement Stripe
          </p>
        </div>

        {/* Status banner */}
        <div
          style={{
            background: requiredOk ? '#0e3d1c' : '#3d0e0e',
            border: `1px solid ${requiredOk ? '#2e8a45' : '#8a2e2e'}`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '40px',
              marginBottom: '8px',
              lineHeight: 1,
            }}
          >
            {requiredOk ? '✅' : '❌'}
          </div>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 700,
              margin: 0,
              marginBottom: '6px',
              color: requiredOk ? '#5bd678' : '#ff6b6b',
            }}
          >
            {requiredOk
              ? 'Tout est configuré — le checkout doit fonctionner'
              : 'Configuration incomplète — le checkout va échouer'}
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: '#cfd3d8',
              margin: 0,
              maxWidth: '500px',
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: 1.5,
            }}
          >
            {requiredOk
              ? 'Toutes les variables requises sont présentes. Retournez sur /checkout?plan=pro pour effectuer un paiement.'
              : 'Certaines variables Stripe requises sont manquantes. Le checkout affichera l\'erreur "STRIPE_SECRET_KEY is not set" tant que vous ne les aurez pas ajoutées dans le dashboard Vercel ET redéployé.'}
          </p>
        </div>

        {/* Environment info */}
        <div
          style={{
            background: '#121a25',
            border: '1px solid #26303c',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
          }}
        >
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#9aa0a8',
              margin: 0,
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Environnement d&apos;exécution
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              fontSize: '13px',
            }}
          >
            <div>
              <div style={{ color: '#7e848d', fontSize: '11px', marginBottom: '2px' }}>
                Plateforme
              </div>
              <div style={{ fontWeight: 700, color: '#ffae36' }}>
                {isVercel ? '☁️ Vercel' : '💻 Local'}
              </div>
            </div>
            <div>
              <div style={{ color: '#7e848d', fontSize: '11px', marginBottom: '2px' }}>
                VERCEL_ENV
              </div>
              <div style={{ fontWeight: 600 }}>
                {vercelEnv}
              </div>
            </div>
            <div>
              <div style={{ color: '#7e848d', fontSize: '11px', marginBottom: '2px' }}>
                VERCEL_URL
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '12px',
                  wordBreak: 'break-all',
                }}
              >
                {vercelUrl}
              </div>
            </div>
            <div>
              <div style={{ color: '#7e848d', fontSize: '11px', marginBottom: '2px' }}>
                Git SHA
              </div>
              <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '12px' }}>
                {gitSha}
              </div>
            </div>
            <div>
              <div style={{ color: '#7e848d', fontSize: '11px', marginBottom: '2px' }}>
                NODE_ENV
              </div>
              <div style={{ fontWeight: 600 }}>{nodeEnv}</div>
            </div>
          </div>
        </div>

        {/* Variables checklist */}
        <div
          style={{
            background: '#121a25',
            border: '1px solid #26303c',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              margin: 0,
              marginBottom: '16px',
              color: '#f5f5f3',
            }}
          >
            Variables d&apos;environnement
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {vars.map((v) => (
              <div
                key={v.name}
                style={{
                  background: '#0a0b0d',
                  border: `1px solid ${
                    v.status === 'set'
                      ? '#2e8a45'
                      : v.status === 'missing'
                      ? '#8a2e2e'
                      : '#8a8a2e'
                  }`,
                  borderRadius: '8px',
                  padding: '14px 16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <code
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#f5f5f3',
                        wordBreak: 'break-all',
                      }}
                    >
                      {v.name}
                    </code>
                    {v.required && (
                      <span
                        style={{
                          marginLeft: '8px',
                          background: '#26303c',
                          color: '#a6aab1',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        Requis
                      </span>
                    )}
                    {v.status === 'set' && (
                      <div
                        style={{
                          marginTop: '6px',
                          fontSize: '12px',
                          color: '#5bd678',
                          fontFamily: 'monospace',
                        }}
                      >
                        {mask(v.value)}
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: '#a6aab1',
                        lineHeight: 1.5,
                      }}
                    >
                      {v.hint}
                    </div>
                  </div>
                  <Badge status={v.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How to fix */}
        {!requiredOk && (
          <div
            style={{
              background: '#161e2a',
              border: '1px solid #3a4250',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{
                fontSize: '16px',
                fontWeight: 700,
                margin: 0,
                marginBottom: '14px',
                color: '#ffae36',
              }}
            >
              🚀 Como corrigir (passo a passo)
            </h3>
            <ol
              style={{
                paddingLeft: '20px',
                margin: 0,
                color: '#cfd3d8',
                fontSize: '13.5px',
                lineHeight: 1.7,
              }}
            >
              <li style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#f5f5f3' }}>Abra o painel da Vercel:</strong>{' '}
                <a
                  href="https://vercel.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#ffae36', textDecoration: 'underline' }}
                >
                  vercel.com/dashboard
                </a>{' '}
                → clique no seu projeto <em>le-tresor-du-soudeur</em> →{' '}
                <strong>Settings</strong> → <strong>Environment Variables</strong>
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#f5f5f3' }}>
                  Para cada variável com ❌ acima
                </strong>
                , clique em <strong>&quot;Add New&quot;</strong>, cole o nome exato
                (ex.: <code style={{ background: '#0a0b0d', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '12px' }}>STRIPE_SECRET_KEY</code>),
                cole o valor, marque as <strong>3 caixas</strong> (Production +
                Preview + Development) e clique em <strong>Save</strong>
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#ffae36' }}>CRÍTICO:</strong> vá na aba{' '}
                <strong>Deployments</strong> → clique nos 3 pontinhos{' '}
                <code style={{ background: '#0a0b0d', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '12px' }}>⋯</code>{' '}
                ao lado do deploy mais recente → <strong>Redeploy</strong> →
                desmarque <em>&quot;Use existing Build Cache&quot;</em> → clique em{' '}
                <strong>Redeploy</strong>
              </li>
              <li style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#f5f5f3' }}>
                  Aguarde o status ficar <em>Ready</em>
                </strong>{' '}
                (bolinha verde, ~1 min), depois recarregue esta página
              </li>
              <li>
                <strong style={{ color: '#5bd678' }}>Confirmar:</strong> todas as
                variáveis acima devem mostrar <Badge status="set" /> e o banner no
                topo deve ficar verde. Depois, o checkout vai funcionar.
              </li>
            </ol>
          </div>
        )}

        {/* Bonus: plan + bump info */}
        <div
          style={{
            background: '#121a25',
            border: '1px solid #26303c',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#9aa0a8',
              margin: 0,
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Catalogue de produits
          </h3>
          <div style={{ fontSize: '12.5px', color: '#cfd3d8', lineHeight: 1.6 }}>
            <strong style={{ color: '#f5f5f3' }}>Plans principaux:</strong>
            <ul style={{ margin: '4px 0 12px 20px', padding: 0 }}>
              {Object.values(PLANS).map((p) => (
                <li key={p.id}>
                  <code style={{ fontFamily: 'monospace', color: '#ffae36' }}>
                    {p.id}
                  </code>{' '}
                  — {p.name} —{' '}
                  <strong>{formatPrice(p.amount, p.currency)}</strong>
                </li>
              ))}
            </ul>
            <strong style={{ color: '#f5f5f3' }}>Order bumps:</strong>
            <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
              {Object.values(BUMPS).map((b) => (
                <li key={b.id}>
                  <code style={{ fontFamily: 'monospace', color: '#ffae36' }}>
                    {b.id}
                  </code>{' '}
                  — {b.name} —{' '}
                  <strong>{formatPrice(b.amount, b.currency)}</strong>
                  {b.isCombo && (
                    <em style={{ color: '#7e848d' }}> (combo)</em>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Quick links */}
        <div
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: '#7e848d',
            lineHeight: 1.7,
          }}
        >
          <div>
            <a
              href="/api/debug/env"
              style={{ color: '#ffae36', textDecoration: 'underline' }}
            >
              /api/debug/env
            </a>{' '}
            (JSON) ·{' '}
            <a
              href="/api/checkout"
              style={{ color: '#ffae36', textDecoration: 'underline' }}
            >
              /api/checkout
            </a>{' '}
            (docs) ·{' '}
            <a href="/" style={{ color: '#ffae36', textDecoration: 'underline' }}>
              ← Retour à l&apos;accueil
            </a>
          </div>
          <div style={{ marginTop: '8px' }}>
            Page générée à {new Date().toLocaleTimeString('fr-FR')} ·{' '}
            {getPublicAssetUrl('/assets/pack-pro.webp') ? 'URLs publiques activées' : 'NEXT_PUBLIC_BASE_URL non configuré'}
          </div>
        </div>
      </div>
    </main>
  )
}
