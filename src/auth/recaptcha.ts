declare global { interface Window { grecaptcha?: { ready: (callback: () => void) => void; execute: (siteKey: string, options: { action: string }) => Promise<string> } } }

let loadedSiteKey = ''
export async function executeRecaptcha(siteKey: string | null, action: 'login' | 'register') {
  if (!siteKey) return undefined
  if (!window.grecaptcha || loadedSiteKey !== siteKey) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[data-recaptcha-key="${siteKey}"]`)
      if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); if (window.grecaptcha) resolve(); return }
      const script = document.createElement('script'); script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`; script.async = true; script.dataset.recaptchaKey = siteKey; script.onload = () => resolve(); script.onerror = () => reject(new Error('reCAPTCHA could not be loaded.')); document.head.append(script)
    })
    loadedSiteKey = siteKey
  }
  return new Promise<string>((resolve) => window.grecaptcha!.ready(() => void window.grecaptcha!.execute(siteKey, { action }).then(resolve)))
}
