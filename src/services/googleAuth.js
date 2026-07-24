const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const BIGQUERY_READONLY_SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly'

let googleScriptPromise = null

function getGoogleClientId() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('Defina VITE_GOOGLE_CLIENT_ID para usar a integração direta com o BigQuery.')
  }
  return clientId
}

function loadGoogleIdentityScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services só funciona no navegador.'))
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google)
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`)
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.google), { once: true })
        existingScript.addEventListener('error', () => reject(new Error('Falha ao carregar Google Identity Services.')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = GOOGLE_IDENTITY_SCRIPT_URL
      script.async = true
      script.defer = true
      script.onload = () => resolve(window.google)
      script.onerror = () => reject(new Error('Falha ao carregar Google Identity Services.'))
      document.head.appendChild(script)
    })
  }

  return googleScriptPromise
}

export function isGoogleTokenExpired(token) {
  if (!token?.access_token || !token?.expires_at) return true
  return Date.now() >= token.expires_at - 60_000
}

export async function requestGoogleAccessToken(previousToken = null) {
  await loadGoogleIdentityScript()

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: getGoogleClientId(),
      scope: BIGQUERY_READONLY_SCOPE,
      callback: (response) => {
        if (response?.error) {
          reject(new Error(response.error))
          return
        }

        resolve({
          ...response,
          expires_at: Date.now() + Number(response.expires_in ?? 3600) * 1000,
        })
      },
      error_callback: (error) => {
        reject(new Error(error?.message || error?.type || 'Falha ao autenticar com Google.'))
      },
    })

    tokenClient.requestAccessToken({ prompt: previousToken ? '' : 'consent' })
  })
}

export function revokeGoogleAccessToken(token) {
  if (!token?.access_token || !window.google?.accounts?.oauth2) return
  window.google.accounts.oauth2.revoke(token.access_token)
}
