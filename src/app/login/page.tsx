import LoginForm from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '32px 30px',
        width: '100%', maxWidth: 340,
        boxShadow: '0 20px 60px rgba(0,0,0,.35)',
      }}>
        <div style={{
          background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
          padding: '10px 12px', margin: '0 auto 20px', maxWidth: 170,
        }}>
          <img src="/logo.jpeg" alt="NexForm" style={{ width: '100%', objectFit: 'contain', display: 'block' }} />
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 900, textAlign: 'center', margin: '0 0 4px' }}>
          Acessar sistema
        </h2>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 600, margin: '0 0 20px' }}>
          Gestão de Revendedores
        </p>

        <LoginForm />
      </div>
    </div>
  )
}
