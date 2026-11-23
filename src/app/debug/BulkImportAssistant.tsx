'use client'

import { useState, useMemo } from 'react'

/**
 * Bulk Import Assistant — interactive client component.
 *
 * Lets the user paste their Stripe key=value pairs (one per line, like
 * .env format) into a textarea, then renders:
 *   - A list of which known env vars were detected and which are still
 *     missing
 *   - A "Copy as .env" button that copies the parsed entries back to the
 *     clipboard (so the user can paste into the Vercel bulk-import field)
 *
 * IMPORTANT: the pasted values stay in the browser memory only. They are
 * NOT sent to any server, NOT logged, NOT committed anywhere. This
 * component is purely client-side state.
 */

interface VarCheck {
  name: string
  value: string | undefined
  status: 'set' | 'empty' | 'missing'
  required: boolean
  hint: string
}

const KNOWN_VARS: Array<{ name: string; required: boolean }> = [
  { name: 'STRIPE_SECRET_KEY', required: true },
  { name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', required: true },
  { name: 'STRIPE_WEBHOOK_SECRET', required: false },
  { name: 'NEXT_PUBLIC_BASE_URL', required: true },
]

export function BulkImportAssistant({
  currentEnvVars,
}: {
  currentEnvVars: VarCheck[]
}) {
  const [pasted, setPasted] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle'
  )

  // Parse the textarea content as .env format
  const parsed = useMemo(() => {
    const result: Record<string, string> = {}
    const lines = pasted.split(/\r?\n/)
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) continue
      const key = line.slice(0, eqIdx).trim()
      let value = line.slice(eqIdx + 1).trim()
      // Strip surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key) {
        result[key] = value
      }
    }
    return result
  }, [pasted])

  // For each known var, check if the user provided it in the textarea
  const detection = useMemo(() => {
    return KNOWN_VARS.map((kv) => {
      const inTextarea = Object.prototype.hasOwnProperty.call(parsed, kv.name)
      const inEnv = currentEnvVars.find((v) => v.name === kv.name)
      const alreadySetOnServer = inEnv?.status === 'set'
      return {
        ...kv,
        inTextarea,
        alreadySetOnServer,
        // If already set on server, no action needed
        // If in textarea, will be imported
        // If neither, still missing
        actionNeeded: !alreadySetOnServer && !inTextarea,
      }
    })
  }, [parsed, currentEnvVars])

  const missingCount = detection.filter((d) => d.actionNeeded).length
  const readyCount = detection.filter((d) => !d.actionNeeded).length

  // Generate the .env text for the Vercel bulk-import field
  const envText = useMemo(() => {
    return Object.entries(parsed)
      .filter(([k]) => KNOWN_VARS.some((kv) => kv.name === k))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  }, [parsed])

  const handleCopy = async () => {
    if (!envText) {
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 2000)
      return
    }
    try {
      await navigator.clipboard.writeText(envText)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 2000)
    }
  }

  return (
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
          marginBottom: '6px',
          color: '#ffae36',
        }}
      >
        📋 Assistente de Importação em Massa (Vercel)
      </h3>
      <p
        style={{
          fontSize: '12.5px',
          color: '#a6aab1',
          margin: 0,
          marginBottom: '14px',
          lineHeight: 1.5,
        }}
      >
        Cole abaixo suas chaves Stripe no formato <code style={{ background: '#0a0b0d', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '11.5px' }}>CHAVE=valor</code>{' '}
        (uma por linha, igual ao .env). A página detecta quais vars foram
        fornecidas e gera um texto pronto para colar no campo &quot;Bulk
        Import&quot; do painel da Vercel.
      </p>

      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder={`STRIPE_SECRET_KEY=sk_live_...\nNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...\nNEXT_PUBLIC_BASE_URL=https://seu-dominio.vercel.app`}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: '120px',
          background: '#0a0b0d',
          color: '#f5f5f3',
          border: '1px solid #26303c',
          borderRadius: '8px',
          padding: '12px',
          fontFamily: 'monospace',
          fontSize: '12.5px',
          lineHeight: 1.5,
          resize: 'vertical',
          outline: 'none',
        }}
      />

      {/* Detection summary */}
      <div style={{ marginTop: '14px' }}>
        <div
          style={{
            fontSize: '12px',
            color: '#9aa0a8',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 700,
          }}
        >
          Status da detecção ({readyCount}/{KNOWN_VARS.length} prontos)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {detection.map((d) => {
            let icon: string
            let color: string
            let label: string
            if (d.alreadySetOnServer) {
              icon = '✅'
              color = '#5bd678'
              label = 'Já configurada no servidor'
            } else if (d.inTextarea) {
              icon = '🟢'
              color = '#5bd678'
              label = 'Detectada — será importada'
            } else {
              icon = '❌'
              color = '#ff6b6b'
              label = 'Ainda não fornecida'
            }
            return (
              <div
                key={d.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '12.5px',
                  fontFamily: 'monospace',
                }}
              >
                <span style={{ fontSize: '14px' }}>{icon}</span>
                <code style={{ color: '#f5f5f3', fontWeight: 700 }}>
                  {d.name}
                </code>
                <span style={{ color, fontSize: '11.5px', fontFamily: 'Inter, sans-serif' }}>
                  {label}
                  {d.required && (
                    <span style={{ color: '#7e848d', marginLeft: '6px' }}>
                      (obrigatória)
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          marginTop: '14px',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={handleCopy}
          disabled={!envText}
          style={{
            background: envText ? '#ffae36' : '#26303c',
            color: envText ? '#17120a' : '#7e848d',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: envText ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {copyState === 'copied'
            ? '✓ Copiado!'
            : copyState === 'error'
            ? '⚠ Erro ao copiar'
            : '📋 Copiar texto .env'}
        </button>
        {envText && (
          <span style={{ fontSize: '11.5px', color: '#7e848d' }}>
            ({Object.keys(parsed).filter((k) => KNOWN_VARS.some((kv) => kv.name === k)).length}{' '}
            variáveis detectadas)
          </span>
        )}
      </div>

      {/* How to use this in Vercel */}
      <div
        style={{
          marginTop: '14px',
          background: '#0a0b0d',
          border: '1px solid #26303c',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '11.5px',
          color: '#a6aab1',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: '#f5f5f3' }}>Como usar no painel da Vercel:</strong>
        <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
          <li>
            Vercel → seu projeto → <strong>Settings</strong> →{' '}
            <strong>Environment Variables</strong>
          </li>
          <li>
            Clique em <strong>&quot;Add New&quot;</strong> e procure o botão{' '}
            <strong>&quot;Import .env&quot;</strong> ou cole cada variável
            individualmente
          </li>
          <li>
            Para cada variável, <strong>marque as 3 caixas</strong>{' '}
            (Production + Preview + Development)
          </li>
          <li>
            Salve, depois vá em <strong>Deployments</strong> →{' '}
            <code style={{ background: '#161e2a', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '11px' }}>⋯</code>{' '}
            → <strong>Redeploy</strong> (sem cache)
          </li>
        </ol>
      </div>

      {/* Privacy notice */}
      <p
        style={{
          fontSize: '11px',
          color: '#7e848d',
          margin: '12px 0 0 0',
          lineHeight: 1.5,
          fontStyle: 'italic',
        }}
      >
        🔒 Suas chaves NÃO saem do seu navegador. Esta página é 100% client-side
        — nada é enviado para o servidor ou registrado em logs.
      </p>
    </div>
  )
}
