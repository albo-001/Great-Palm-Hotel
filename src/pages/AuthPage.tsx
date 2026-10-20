import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthPageProps = {
  mode: 'signin' | 'signup'
  onSignup?: (profile: { fullName: string; phoneNumber: string; referredBy?: string }) => void
}

function getAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/email rate limit exceeded|rate limit.*email/i.test(message)) {
    return 'Supabase temporarily blocked confirmation emails because its email send limit was reached. Stop retrying for now. Configure custom SMTP in Supabase Authentication → SMTP Settings, then review Authentication → Rate Limits. If this email may already have been registered, try signing in or request one confirmation email after the limit resets.'
  }
  return message || 'Account access failed. Please try again.'
}

export default function AuthPage({ mode, onSignup }: AuthPageProps) {
  const isSignUp = mode === 'signup'
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const referralCode = searchParams.get('ref')?.trim().toUpperCase() ?? ''

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (isSignUp && password !== form.get('confirmPassword')) {
      setMessage('Your passwords do not match. Please check and try again.')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      if (supabase) {
        const email = String(form.get('email') ?? '').trim()
        if (isSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: String(form.get('fullName') ?? '').trim(),
                phone_number: String(form.get('phone') ?? '').trim(),
                ...(referralCode ? { referral_code: referralCode } : {}),
              },
              emailRedirectTo: `${window.location.origin}/account`,
            },
          })
          if (error) throw error
          if (data.session) navigate('/account')
          else setMessage('Account created. Check your email to confirm your address, then sign in.')
          return
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/account')
        return
      }

      if (isSignUp && onSignup) {
        onSignup({
          fullName: String(form.get('fullName') ?? '').trim(),
          phoneNumber: String(form.get('phone') ?? '').trim(),
          ...(referralCode ? { referredBy: referralCode } : {}),
        })
        navigate('/account')
        return
      }
      setMessage('Sign in is not available in browser demo mode. Configure Supabase to enable authentication.')
    } catch (error) {
      setMessage(getAuthErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-back-link" to="/" aria-label="Back to DarkNode">
          <ArrowLeft size={16} /> Back to DarkNode
        </Link>
        <div className="auth-brand">
          <span className="brand-mark">DN</span>
          <span><strong>DarkNode</strong><small>smart money</small></span>
        </div>
        <div className="auth-intro">
          <span className="auth-eyebrow"><LockKeyhole size={14} /> ACCOUNT ACCESS</span>
          <h1 id="auth-title">{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
          <p>{isSignUp ? 'Get started with your DarkNode account.' : 'Sign in to continue to your account.'}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <>
              <label className="field-label" htmlFor="full-name">Full names</label>
              <input className="form-input" id="full-name" name="fullName" type="text" autoComplete="name" placeholder="Your full name" minLength={2} required />
              {referralCode && (
                <>
                  <label className="field-label" htmlFor="signup-referral-code">Referral code</label>
                  <input className="form-input" id="signup-referral-code" name="referralCode" value={referralCode} readOnly />
                </>
              )}
            </>
          )}
          <label className="field-label" htmlFor="auth-email">Email address</label>
          <input className="form-input" id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          {isSignUp && (
            <>
              <label className="field-label" htmlFor="auth-phone">Phone number</label>
              <input className="form-input" id="auth-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="e.g. 07XX XXX XXX" required />
            </>
          )}
          <label className="field-label" htmlFor="auth-password">Password</label>
          <input className="form-input" id="auth-password" name="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder="At least 8 characters" minLength={8} required />
          {isSignUp && (
            <>
              <label className="field-label" htmlFor="confirm-password">Confirm password</label>
              <input className="form-input" id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" placeholder="Re-enter your password" minLength={8} required />
            </>
          )}
          {message && <p className="auth-status" role="status">{message}</p>}
          <button className="primary-button full-button auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Link to={isSignUp ? '/signin' : '/signup'}>{isSignUp ? 'Sign in' : 'Create account'}</Link>
        </p>
        <p className="auth-disclosure">{isSupabaseConfigured
          ? 'Your password is handled by Supabase Auth. Your name and phone number are stored as account display details.'
          : isSignUp
            ? 'Demo signup saves your name and phone number in this browser only. Passwords are never stored.'
            : 'Configure Supabase to enable email and password sign in.'}</p>
      </section>
    </main>
  )
}
